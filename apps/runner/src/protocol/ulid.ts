import { randomBytes } from "node:crypto";

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;

function encodeTime(time: number): string {
  let value = time;
  let output = "";

  for (let i = 0; i < TIME_LENGTH; i++) {
    output = ENCODING[value % 32] + output;
    value = Math.floor(value / 32);
  }

  return output;
}

function encodeRandom(): string {
  const bytes = randomBytes(RANDOM_LENGTH);
  let output = "";

  for (let i = 0; i < RANDOM_LENGTH; i++) {
    output += ENCODING[bytes[i] % 32];
  }

  return output;
}

/** Genera un ULID monotónicamente ordenable (suficiente para deduplicación). */
export function ulid(now: number = Date.now()): string {
  return encodeTime(now) + encodeRandom();
}
