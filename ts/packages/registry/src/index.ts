/**
 * Generic class registry — replaces the PHP autoloader's data-driven dispatch.
 *
 * PHP resolved an ontology `model` string (e.g. 'component_input_text') to a
 * class by name and did `new $model()`. TS cannot `new aString()`, so concrete
 * classes register themselves here at module load and the factory looks them up.
 * This makes the set of constructable models a finite, greppable allowlist (the
 * same property the SEC-048 class-name guard gave PHP, but stronger).
 *
 * This is the foundation for the component/section factory (Phase 4); kept generic
 * so any "model-name → constructor" mapping can reuse it.
 */

export type Constructor<TBase, TArgs extends unknown[] = never[]> = new (...args: TArgs) => TBase;

export class DuplicateRegistrationError extends Error {
  override name = 'DuplicateRegistrationError';
}
export class UnknownModelError extends Error {
  override name = 'UnknownModelError';
}

export class ClassRegistry<TBase, TArgs extends unknown[] = never[]> {
  private readonly map = new Map<string, Constructor<TBase, TArgs>>();

  /** Register a model name → constructor. Throws on duplicate (unless `replace`). */
  register(model: string, ctor: Constructor<TBase, TArgs>, replace = false): void {
    if (!replace && this.map.has(model)) {
      throw new DuplicateRegistrationError(`Model already registered: ${model}`);
    }
    this.map.set(model, ctor);
  }

  has(model: string): boolean {
    return this.map.has(model);
  }

  /** Look up a constructor; throws UnknownModelError if absent. */
  get(model: string): Constructor<TBase, TArgs> {
    const ctor = this.map.get(model);
    if (ctor === undefined) throw new UnknownModelError(`Unknown model: ${model}`);
    return ctor;
  }

  /** Construct an instance of the registered model. */
  create(model: string, ...args: TArgs): TBase {
    return new (this.get(model))(...args);
  }

  /** All registered model names (sorted, for stable diagnostics). */
  models(): string[] {
    return [...this.map.keys()].sort();
  }

  size(): number {
    return this.map.size;
  }
}
