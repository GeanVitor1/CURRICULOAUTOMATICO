import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { publicFormRequest } from "../server/public-form-request";
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("node:https", () => ({ request: vi.fn() }));
afterEach(() => vi.resetAllMocks());

function mockResponse(
  status = 200,
  parts = [Buffer.from("recebido")],
  location?: string,
) {
  vi.mocked(lookup).mockResolvedValue([
    { address: "8.8.8.8", family: 4 },
  ] as any);
  const sent: Buffer[] = [];
  vi.mocked(request).mockImplementation(((
    _url: URL,
    _options: unknown,
    receive: (r: any) => void,
  ) => {
    const req = new EventEmitter() as any;
    req.end = (body?: Buffer) => {
      if (body) sent.push(body);
      queueMicrotask(() => {
        const res = new EventEmitter() as any;
        res.statusCode = status;
        res.headers = { "content-type": "text/html", location };
        res.destroy = (error: Error) => {
          res.emit("error", error);
        };
        receive(res);
        parts.forEach((part) => res.emit("data", part));
        res.emit("end");
      });
    };
    return req;
  }) as any);
  return sent;
}
it("pins the checked address to the TLS connection and preserves multipart resume bytes", async () => {
  const sent = mockResponse();
  const body = new FormData();
  body.set("email", "synthetic@example.test");
  body.set("resume", new Blob(["%PDF-private-test"]), "resume.pdf");
  const result = await publicFormRequest("https://employer.example/apply", {
    method: "POST",
    body,
    redirect: "manual",
  });
  expect(result.status).toBe(200);
  expect(await result.text()).toBe("recebido");
  const [url, options] = vi.mocked(request).mock.calls[0] as unknown as [
    URL,
    any,
  ];
  expect(url.hostname).toBe("employer.example");
  expect(options.agent).toBe(false);
  expect(options.headers["content-type"]).toMatch(
    /^multipart\/form-data; boundary=/,
  );
  const resolved = vi.fn();
  options.lookup("employer.example", { all: false }, resolved);
  expect(resolved).toHaveBeenCalledWith(null, "8.8.8.8", 4);
  const resolvedAll = vi.fn();
  options.lookup("employer.example", { all: true }, resolvedAll);
  expect(resolvedAll).toHaveBeenCalledWith(
    null,
    [{ address: "8.8.8.8", family: 4 }],
    4,
  );
  expect(lookup).toHaveBeenCalledOnce();
  expect(sent[0].toString()).toContain("%PDF-private-test");
});
it.each(["127.0.0.1", "169.254.169.254", "::ffff:127.0.0.1"])(
  "rejects non-public DNS before sending candidate data: %s",
  async (address) => {
    mockResponse();
    vi.mocked(lookup).mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address, family: address.includes(":") ? 6 : 4 },
    ] as any);
    await expect(
      publicFormRequest("https://employer.example/apply", {
        method: "POST",
        body: "private",
        redirect: "manual",
      }),
    ).rejects.toThrow("rede não permitido");
    expect(request).not.toHaveBeenCalled();
  },
);
it("does not follow or retry redirects after a POST", async () => {
  mockResponse(307, [], "https://evil.example/steal");
  const response = await publicFormRequest("https://employer.example/apply", {
    method: "POST",
    body: "private",
    redirect: "manual",
  });
  expect(response.status).toBe(307);
  expect(request).toHaveBeenCalledOnce();
  await expect(
    publicFormRequest("https://employer.example/apply", { redirect: "error" }),
  ).rejects.toThrow("Redirecionamento");
  expect(request).toHaveBeenCalledTimes(2);
});
it("bounds response memory and refuses automatic redirect mode", async () => {
  mockResponse(200, [Buffer.alloc(1500001)]);
  await expect(
    publicFormRequest("https://employer.example/apply", { redirect: "error" }),
  ).rejects.toThrow("limite de leitura");
  vi.mocked(request).mockClear();
  await expect(
    publicFormRequest("https://employer.example/apply"),
  ).rejects.toThrow("redirecionamento");
  expect(request).not.toHaveBeenCalled();
});
it("rejects invalid upstream status without an uncaught event-handler exception", async () => {
  mockResponse(700);
  await expect(
    publicFormRequest("https://employer.example/apply", { redirect: "error" }),
  ).rejects.toThrow("HTTP inválida");
});
