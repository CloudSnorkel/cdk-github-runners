import { Octokit } from '@octokit/rest';
import { getAppOctokit, redeliver } from './lambda-github';

/**
 * Get webhook delivery failures since the last processed delivery ID.
 *
 * @internal
 */
async function deliveryFailuresSince(octokit: Octokit, sinceId: number) {
  const deliveries: Map<string, { id: number; deliveredAt: Date; redelivery: boolean }> = new Map();
  const successfulDeliveries: Set<string> = new Set();

  for await (const response of octokit.paginate.iterator('GET /app/hook/deliveries')) {
    if (response.status !== 200) {
      throw new Error('Failed to fetch webhook deliveries');
    }

    for (const delivery of response.data) {
      const deliveredAt = new Date(delivery.delivered_at);
      const success = delivery.status === 'OK';

      if (success) {
        successfulDeliveries.add(delivery.guid);
        continue;
      }

      if (successfulDeliveries.has(delivery.guid)) {
        // do not redeliver deliveries that were already successful
        continue;
      }

      deliveries.set(delivery.guid, { id: delivery.id, deliveredAt, redelivery: delivery.redelivery });

      if (delivery.id <= sinceId) {
        // stop processing if we reach the last processed delivery ID
        return deliveries;
      }

      if (deliveredAt < new Date(Date.now() - 1000 * 60 * 60)) {
        // stop processing if the delivery is older than 30 minutes (for first iteration and performance)
        return deliveries;
      }
    }
  }

  return deliveries;
}

let lastDeliveryIdProcessed = 0;
const failures: Map<string, { id: number; firstDeliveredAt: Date }> = new Map();

export async function handler() {
  const octokit = await getAppOctokit();
  if (!octokit) {
    console.info({
      notice: 'Skipping webhook redelivery',
      reason: 'App installation might not be configured or the app is not installed.',
    });
    return;
  }

  // fetch deliveries since the last processed delivery ID
  // for any failures:
  //  1. if this is not a redelivery, save the delivery ID and first delivered at time -- and retry
  //  2. if this is a redelivery, check if the original delivery is still within the time limit and retry if it is
  const timeLimitMs = 1000 * 60 * 60; // 1 hour
  const deliveries = await deliveryFailuresSince(octokit, lastDeliveryIdProcessed);
  for (const [guid, details] of deliveries) {
    if (!details.redelivery) {
      failures.set(guid, { id: details.id, firstDeliveredAt: details.deliveredAt });
      console.log({
        notice: 'Redelivering failed delivery',
        deliveryId: details.id,
        guid: guid,
        firstDeliveredAt: details.deliveredAt,
      });
      await redeliver(octokit, details.id);
    } else {
      // if this is a redelivery, check if the original delivery is still within the time limit
      const originalFailure = failures.get(guid);
      if (originalFailure && (new Date().getTime() - originalFailure.firstDeliveredAt.getTime() < timeLimitMs)) {
        console.log({
          notice: 'Redelivering failed delivery',
          deliveryId: details.id,
          guid: guid,
          firstDeliveredAt: originalFailure.firstDeliveredAt,
        });
        await redeliver(octokit, details.id);
      } else {
        console.log({
          notice: 'Skipping redelivery of old failed delivery',
          deliveryId: details.id,
          guid: guid,
          firstDeliveredAt: originalFailure?.firstDeliveredAt,
        });
      }
    }
    lastDeliveryIdProcessed = Math.max(lastDeliveryIdProcessed, details.id);
  }
}
