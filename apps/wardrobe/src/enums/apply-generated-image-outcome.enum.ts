/**
 * Result of a generation job's terminal write.
 *
 * A bare boolean could not tell "the item was deleted while its job ran" from
 * "another delivery already finished it", and the two need opposite cleanup:
 * the first orphans a generated object in S3 that nothing else will ever
 * delete, the second must leave the winner's files alone.
 */
export enum ApplyGeneratedImageOutcome {
  Applied = 'applied',
  NotPending = 'not_pending',
  NotFound = 'not_found',
}
