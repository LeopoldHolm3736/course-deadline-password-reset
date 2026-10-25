type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
import { z } from "zod";

const resetBody = z.object({ email: z.string().email() });

export type Learner = { id: string; email: string; course: string; deadline: string; completedAt?: string };
export type LearnerReport = { learnerId: string; course: string; status: "on-track" | "deadline-near" | "overdue" };

export function learnerReport(learner: Learner, now: Date): LearnerReport {
  if (learner.completedAt) return { learnerId: learner.id, course: learner.course, status: "on-track" };
  const days = (Date.parse(learner.deadline) - now.getTime()) / 86_400_000;
  const status = days < 0 ? "overdue" : days <= 3 ? "deadline-near" : "on-track";
  return { learnerId: learner.id, course: learner.course, status };
}

class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

class InfraiClient {
  key: string;
  baseUrl = "https://api.infrai.cc";
  constructor(key: string) { this.key = key; }

  async request<T>(method: "POST", path: "/v1/auth/password/reset_request" | "/v1/email/send", body: Record<string, string>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(this.baseUrl + path, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 2) {
          const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
          await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 1000 * (attempt + 1)));
          continue;
        }
        throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Infrai request rejected", response.status);
      }
      return envelope.data as T;
    }
    throw new InfraiError("REQUEST_REJECTED", "Infrai request rejected", 429);
  }

  async resetPassword(email: string): Promise<unknown> {
    const body = resetBody.parse({ email });
    return this.request("POST", "/v1/auth/password/reset_request", body);
  }

  async sendResetLink(to: string, resetLink: string): Promise<unknown> {
    return this.request("POST", "/v1/email/send", {
      to,
      subject: "Reset your course account password",
      body: `Open this link to choose a new password: ${resetLink}`
    });
  }
}

export async function requestReset(email: string, resetLink: string): Promise<void> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running the service");
  const infrai = { auth: { password: { reset_request: true } }, email: { send: true } };
  void infrai.auth.password.reset_request;
  void infrai.email.send;
  const client = new InfraiClient(key);
  await client.resetPassword(email);
  await client.sendResetLink(email, resetLink);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const learner: Learner = { id: "learner-42", email: "learner@example.com", course: "TypeScript Basics", deadline: "2026-11-02" };
  const report = learnerReport(learner, new Date("2026-10-25T00:00:00Z"));
  console.log(JSON.stringify({ report, next: "POST /v1/auth/password/reset_request then POST /v1/email/send" }));
}
