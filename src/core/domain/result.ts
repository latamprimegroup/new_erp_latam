/**
 * Result Pattern - Retorno padronizado sem exceções genéricas
 * Success ou Failure com tipo explícito
 */
export type Result<T, E = Error> = Success<T, E> | Failure<T, E>

export class Success<T, E = Error> {
  readonly ok = true
  readonly value: T
  constructor(value: T) {
    this.value = value
  }
  isOk(): this is Success<T, E> {
    return true
  }
  isFail(): this is Failure<T, E> {
    return false
  }
  map<U>(fn: (v: T) => U): Result<U, E> {
    return new Success(fn(this.value))
  }
  unwrap(): T {
    return this.value
  }
}

export class Failure<T, E = Error> {
  readonly ok = false
  readonly error: E
  constructor(error: E) {
    this.error = error
  }
  isOk(): this is Success<T, E> {
    return false
  }
  isFail(): this is Failure<T, E> {
    return true
  }
  map<U>(_fn: (v: T) => U): Result<U, E> {
    return this as unknown as Result<U, E>
  }
  unwrap(): never {
    throw this.error
  }
}

export function ok<T, E = Error>(value: T): Result<T, E> {
  return new Success(value)
}

export function err<E, T = never>(error: E): Result<T, E> {
  return new Failure(error)
}
