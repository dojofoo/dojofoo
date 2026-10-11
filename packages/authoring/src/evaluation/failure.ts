/** A verified teaching failure, distinct from a broken provider or test fixture. */
export class TeachingFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeachingFailure";
  }
}

/** Authored content must be corrected before an evaluation can run. */
export class MaterialFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterialFailure";
  }
}
