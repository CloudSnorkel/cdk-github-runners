import { Octokit } from '@octokit/rest';
import { WebhookDelivery, getDeliveryDetail, getFailedDeliveries, getOctokit, redeliver, WorkflowJob } from './lambda-github';
import { getLastDeliveryId, setLastDeliveryId } from './lambda-helpers';

/**
 * Check if a failed delivery should be redelivered.
 *
 * Exported for unit testing.
 * @internal
 */
export async function shouldRedeliver(octokit: Octokit, delivery: WebhookDelivery): Promise<boolean> {
  if (delivery.event !== 'workflow_job' || delivery.action !== 'queued') {
    // the webhook handler lambda only cares about workflow_job.queued events
    console.log(
      `skipping failed delivery with ID ${delivery.id} with event=${delivery.event} action=${delivery.action}`,
    );
    return false;
  }

  const deliveryDetail = await getDeliveryDetail(octokit, delivery.id);

  const payload = deliveryDetail.request.payload;
  if (payload && payload.workflow_job && typeof payload.workflow_job === 'object') {
    const workflow_job = payload.workflow_job as WorkflowJob;
    if (!workflow_job.labels.includes('self-hosted')) {
      console.log(
        `skipping failed delivery with ID ${delivery.id} with label=${JSON.stringify(workflow_job.labels)}`,
      );
      return false;
    }

    if (delivery.redelivery) {
      const deliveredAt = new Date(deliveryDetail.delivered_at);
      const jobStartedAt = new Date(workflow_job.started_at);
      // If it is already a redelivery, and the job started more than 30 minutes ago, we should have retried for
      // 5-6 times already and it is likely that the job will never succeed, so we skip redelivering.
      // This avoids an infinite loop of redeliveries.
      if (deliveredAt.getTime() - jobStartedAt.getTime() > 1000 * 60 * 30) {
        // avoid redelivering a redelivery, which would result in an infinite loop
        console.log(`skipping failed delivery with ID ${delivery.id} as it is a redelivery for a job that started more than 30 minutes ago`);
        return false;
      }
    }
  } else {
    console.warn('Unexpected payload for delivery:', delivery.id);
    return false;
  }

  return true;
}

export async function handler() {

  const lastDeliveryId = await getLastDeliveryId();
  const { octokit } = await getOctokit();

  const { failedDeliveries, latestDeliveryId } = await getFailedDeliveries(octokit, lastDeliveryId);

  for (const delivery of failedDeliveries) {
    if (await shouldRedeliver(octokit, delivery)) {
      try {
        await redeliver(octokit, delivery.id);
      } catch (error) {
        console.error(`Failed to redeliver delivery with ID ${delivery.id}:`, error);
      }
    }
  }

  await setLastDeliveryId(latestDeliveryId);
}
