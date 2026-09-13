export type StorageErrorCode =
  | "database-unavailable"
  | "read-failed"
  | "write-failed"
  | "quota-exceeded"
  | "reset-failed";

export class StorageError extends Error {
  constructor(
    public readonly code: StorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StorageError";
  }
}

export function toStorageError(
  error: unknown,
  operation: "open" | "read" | "write" | "reset",
): StorageError {
  if (error instanceof StorageError) return error;
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return new StorageError(
      "quota-exceeded",
      "저장 공간이 부족합니다. 기존 물건을 정리한 뒤 다시 시도해 주세요.",
      { cause: error },
    );
  }

  const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
  const messages = {
    open: "브라우저 저장소를 열 수 없습니다.",
    read: "저장된 데이터를 읽지 못했습니다.",
    write: "데이터를 저장하지 못했습니다.",
    reset: "저장소를 초기화하지 못했습니다.",
  } as const;
  const codes = {
    open: "database-unavailable",
    read: "read-failed",
    write: "write-failed",
    reset: "reset-failed",
  } as const;
  return new StorageError(codes[operation], messages[operation] + detail, { cause: error });
}
