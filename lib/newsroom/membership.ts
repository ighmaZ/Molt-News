import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------ */
/*  Membership store — Redis in production, local JSON in dev         */
/* ------------------------------------------------------------------ */

const DATA_DIR = path.join(process.cwd(), "data");
const MEMBERS_FILE = path.join(DATA_DIR, "newsroom-members.json");

const REDIS_API_URL = process.env.KV_REST_API_URL?.replace(/\/$/, "") ?? "";
const REDIS_API_TOKEN = process.env.KV_REST_API_TOKEN ?? "";

const REDIS_PREFIX = "molt:newsroom:member:";

export interface MemberRecord {
  address: string;
  txHash: string;
  memberSince: string;
}

/* ---------- helpers ---------- */

function isRedisConfigured(): boolean {
  return REDIS_API_URL.length > 0 && REDIS_API_TOKEN.length > 0;
}

function normalizeAddress(address: string): string {
  return address.toLowerCase().trim();
}

/* ---------- Redis ---------- */

type RedisEnvelope<T = unknown> = { result: T } | { error: string };

async function redisCommand<T = unknown>(
  command: (string | number)[],
): Promise<T> {
  const response = await fetch(REDIS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${REDIS_API_TOKEN}`,
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  const payload = (await response.json()) as RedisEnvelope<T>;

  if ("error" in payload) {
    throw new Error(payload.error);
  }

  return payload.result;
}

async function getMemberRedis(address: string): Promise<MemberRecord | null> {
  const key = `${REDIS_PREFIX}${normalizeAddress(address)}`;
  const raw = await redisCommand<string | null>(["GET", key]);

  if (!raw) return null;

  try {
    return JSON.parse(raw) as MemberRecord;
  } catch {
    return null;
  }
}

async function registerMemberRedis(
  address: string,
  txHash: string,
): Promise<MemberRecord> {
  const normalized = normalizeAddress(address);
  const existing = await getMemberRedis(normalized);
  if (existing) return existing;

  const record: MemberRecord = {
    address: normalized,
    txHash,
    memberSince: new Date().toISOString(),
  };

  const key = `${REDIS_PREFIX}${normalized}`;
  await redisCommand(["SET", key, JSON.stringify(record)]);

  return record;
}

/* ---------- File fallback ---------- */

async function ensureMembersFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(MEMBERS_FILE);
  } catch {
    await fs.writeFile(
      MEMBERS_FILE,
      JSON.stringify({ members: [] }, null, 2),
      "utf8",
    );
  }
}

async function readMembers(): Promise<MemberRecord[]> {
  await ensureMembersFile();
  const raw = await fs.readFile(MEMBERS_FILE, "utf8");
  const parsed = JSON.parse(raw) as { members?: unknown };
  return Array.isArray(parsed.members)
    ? (parsed.members as MemberRecord[])
    : [];
}

async function writeMembers(members: MemberRecord[]): Promise<void> {
  await ensureMembersFile();
  const temp = `${MEMBERS_FILE}.tmp`;
  await fs.writeFile(temp, JSON.stringify({ members }, null, 2), "utf8");
  await fs.rename(temp, MEMBERS_FILE);
}

async function getMemberFile(address: string): Promise<MemberRecord | null> {
  const members = await readMembers();
  return (
    members.find((m) => m.address === normalizeAddress(address)) ?? null
  );
}

async function registerMemberFile(
  address: string,
  txHash: string,
): Promise<MemberRecord> {
  const normalized = normalizeAddress(address);
  const members = await readMembers();
  const existing = members.find((m) => m.address === normalized);
  if (existing) return existing;

  const record: MemberRecord = {
    address: normalized,
    txHash,
    memberSince: new Date().toISOString(),
  };

  members.push(record);
  await writeMembers(members);

  return record;
}

/* ---------- Public API ---------- */

export async function isMember(address: string): Promise<boolean> {
  const member = isRedisConfigured()
    ? await getMemberRedis(address)
    : await getMemberFile(address);

  return member !== null;
}

export async function getMember(
  address: string,
): Promise<MemberRecord | null> {
  return isRedisConfigured()
    ? getMemberRedis(address)
    : getMemberFile(address);
}

export async function registerMember(
  address: string,
  txHash: string,
): Promise<MemberRecord> {
  return isRedisConfigured()
    ? registerMemberRedis(address, txHash)
    : registerMemberFile(address, txHash);
}
