import { Octokit } from '@octokit/rest';
import { getAppOctokit, redeliver } from './lambda-github';

/**
 * Summarizes webhook deliveries from the GitHub App and returns a map of delivery GUIDs to their details.
 *
 * Details include:
 * - `id`: The ID of one of the deliveries sharing the same delivery guid.
 * - `firstDeliveredAt`: Timestamp of the first delivery for this guid, or `undefined` if all deliveries found during the time limit are redeliveries.
 * - `success`: A boolean indicating whether any of the deliveries with this guid were successful.
 *
 * @internal
 */
async function summarizeDeliveries(octokit: Octokit, timeLimitMs: number) {
  const timeLimit = new Date(Date.now() - timeLimitMs);
  const deliveries: Map<string, { id: number; firstDeliveredAt?: Date; success: boolean }> = new Map();

  for await (const response of octokit.paginate.iterator('GET /app/hook/deliveries')) {
    if (response.status !== 200) {
      throw new Error('Failed to fetch webhook deliveries');
    }

    for (const delivery of response.data) {
      const deliveredAt = new Date(delivery.delivered_at);
      const success = delivery.status_code >= 200 && delivery.status_code < 300;
      const previousDelivery = deliveries.get(delivery.guid);

      if (deliveredAt < timeLimit) {
        // stop iterating when we find a delivery that is older than two hours
        console.info({
          notice: 'Stopping iteration over webhook deliveries',
          timeLimit: timeLimit,
          stoppedBeforeDelivery: deliveredAt,
          stoppedBeforeGuid: delivery.guid,
          stoppedBeforeDeliveryId: delivery.id,
        });
        return deliveries;
      }

      if (previousDelivery) {
        // if we have a previous delivery with the same guid, we update it

        // we update the status to true if this delivery was successful
        const anySuccess = previousDelivery.success || success;
        // we only save the original delivery time by ignoring redeliveries
        const firstDeliveredAt = delivery.redelivery ? previousDelivery.firstDeliveredAt : new Date(delivery.delivered_at);

        deliveries.set(delivery.guid, {
          id: delivery.id,
          firstDeliveredAt: firstDeliveredAt,
          success: anySuccess,
        });
      } else {
        // if this is the first delivery with this guid, we save it
        deliveries.set(delivery.guid, {
          id: delivery.id,
          firstDeliveredAt: delivery.redelivery ? undefined : new Date(delivery.delivered_at),
          success: success,
        });
      }
    }
  }

  return deliveries;
}

export async function handler() {
  const octokit = await getAppOctokit();

  for (const [delivery, details] of await summarizeDeliveries(octokit, 1000 * 60 * 60)) { // 1-hour time limit
    if (!details.success) { // if the delivery failed
      if (details.firstDeliveredAt) { // if the original delivery is still in the time limit
        console.log({
          notice: 'Redelivering failed delivery',
          deliveryId: details.id,
          guid: delivery,
          firstDeliveredAt: details.firstDeliveredAt,
        });
        await redeliver(octokit, details.id);
      } else {
        console.log({
          notice: 'Skipping redelivery of old failed delivery',
          deliveryId: details.id,
          guid: delivery,
        });
      }
    }
  }
}
