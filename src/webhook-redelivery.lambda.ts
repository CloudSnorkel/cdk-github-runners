import { Octokit } from '@octokit/rest';
import { getAppOctokit, redeliver } from './lambda-github';

/**
 * Get webhook delivery failures since the last processed delivery ID.
 *
 * @internal
 */
async function newDeliveryFailures(octokit: Octokit, sinceId: number) {
  const deliveries: Map<string, { id: number; deliveredAt: Date; redelivery: boolean }> = new Map();
  const successfulDeliveries: Set<string> = new Set();
  const timeLimitMs = 1000 * 60 * 30; // don't look at deliveries over 30 minutes old
  let lastId = 0;
  let processedCount = 0;

  for await (const response of octokit.paginate.iterator('GET /app/hook/deliveries')) {
    if (response.status !== 200) {
      throw new Error('Failed to fetch webhook deliveries');
    }

    for (const delivery of response.data) {
      const deliveredAt = new Date(delivery.delivered_at);
      const success = delivery.status === 'OK';

      if (delivery.id <= sinceId) {
        // stop processing if we reach the last processed delivery ID
        console.info({
          notice: 'Reached last processed delivery ID',
          sinceId: sinceId,
          deliveryId: delivery.id,
          guid: delivery.guid,
          processedCount,
        });
        return { deliveries, lastId };
      }

      lastId = Math.max(lastId, delivery.id);

      if (deliveredAt.getTime() < Date.now() - timeLimitMs) {
        // stop processing if the delivery is too old (for first iteration and performance of further iterations)
        console.info({
          notice: 'Stopping at old delivery',
          deliveryId: delivery.id,
          guid: delivery.guid,
          deliveredAt: deliveredAt,
          processedCount,
        });
        return { deliveries, lastId };
      }

      console.debug({
        notice: 'Processing webhook delivery',
        deliveryId: delivery.id,
        guid: delivery.guid,
        status: delivery.status,
        deliveredAt: delivery.delivered_at,
        redelivery: delivery.redelivery,
      });
      processedCount++;

      if (success) {
        successfulDeliveries.add(delivery.guid);
        continue;
      }

      if (successfulDeliveries.has(delivery.guid)) {
        // do not redeliver deliveries that were already successful
        continue;
      }

      deliveries.set(delivery.guid, { id: delivery.id, deliveredAt, redelivery: delivery.redelivery });
    }
  }

  console.info({
    notice: 'No more webhook deliveries to process',
    deliveryId: 'DONE',
    guid: 'DONE',
    deliveredAt: 'DONE',
    processedCount,
  });

  return { deliveries, lastId };
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
  //  1. if this is not a redelivery, save the delivery ID and time, and finally retry
  //  2. if this is a redelivery, check if the original delivery is still within the time limit and retry if it is
  const { deliveries, lastId } = await newDeliveryFailures(octokit, lastDeliveryIdProcessed);
  lastDeliveryIdProcessed = Math.max(lastDeliveryIdProcessed, lastId);
  const timeLimitMs = 1000 * 60 * 60 * 3; // retry for up to 3 hours
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
      if (originalFailure) {
        if (new Date().getTime() - originalFailure.firstDeliveredAt.getTime() < timeLimitMs) {
          console.log({
            notice: 'Redelivering failed delivery',
            deliveryId: details.id,
            guid: guid,
            firstDeliveredAt: originalFailure.firstDeliveredAt,
          });
          await redeliver(octokit, details.id);
        } else {
          failures.delete(guid); // no need to keep track of this anymore
          console.log({
            notice: 'Skipping redelivery of old failed delivery',
            deliveryId: details.id,
            guid: guid,
            firstDeliveredAt: originalFailure?.firstDeliveredAt,
          });
        }
      } else {
        console.log({
          notice: 'Skipping redelivery of old failed delivery',
          deliveryId: details.id,
          guid: guid,
        });
      }
    }
  }
}
