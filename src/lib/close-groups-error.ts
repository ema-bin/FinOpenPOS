export class CloseGroupsError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "CloseGroupsError";
  }
}
