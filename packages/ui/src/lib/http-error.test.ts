import { expect, it } from "vitest";
import { httpError } from "./http-error";

it.each([
  ['{"error":"History temporarily unavailable"}', "History temporarily unavailable"],
  ['{"message":"Session unavailable"}', "Session unavailable"],
  ['{"error":"agent_failed","message":"The coding agent could not start"}', "The coding agent could not start"],
  ["Internal Server Error", "Internal Server Error"],
  ["", "Request failed (503)."],
  ['{"error":{"code":"unavailable"}}', '{"error":{"code":"unavailable"}}'],
])("preserves useful server evidence without a secondary JSON error: %s", async (body, message) => {
  expect((await httpError(new Response(body, { status: 503 }))).message).toBe(message);
});
