import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ agy: vi.fn(), api: vi.fn() }));
vi.mock("../server/antigravity", () => ({
  antigravityAvailable: (id?: string) => id === "owner",
  searchAntigravity: mocks.agy,
}));
vi.mock("../server/gemini", () => ({
  geminiConfigured: () => true,
  generateGemini: mocks.api,
}));
import { searchCitedUrls } from "../server/equivalent-search";
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());
it("uses the owner's Antigravity even when the Gemini API is configured", async () => {
  const url = "https://jobs.lever.co/company/123";
  mocks.agy.mockResolvedValue({
    verifiedUrls: new Set([url]),
    googleCitationUrls: new Set(),
  });
  expect(await searchCitedUrls("Find public jobs", "owner")).toEqual({
    available: true,
    urls: [url],
  });
  expect(mocks.agy).toHaveBeenCalledWith("owner", "Find public jobs");
  expect(mocks.api).not.toHaveBeenCalled();
});
it("does not silently change to Gemini API when Antigravity fails", async () => {
  mocks.agy.mockRejectedValue(new Error("Antigravity connection unavailable"));
  await expect(searchCitedUrls("Find public jobs", "owner")).rejects.toThrow(
    "Antigravity connection unavailable",
  );
  expect(mocks.api).not.toHaveBeenCalled();
});
it("keeps other accounts outside the owner's Antigravity subscription", async () => {
  mocks.api.mockResolvedValue({ grounding: { groundingChunks: [] } });
  expect(await searchCitedUrls("Find public jobs", "another-user")).toEqual({
    available: true,
    urls: [],
  });
  expect(mocks.agy).not.toHaveBeenCalled();
  expect(mocks.api).toHaveBeenCalledOnce();
});
it('preserves search-returned URL hints for independent publisher validation when native citations are absent',async()=>{
  const url='https://jobs.lever.co/company/00000000-0000-4000-8000-000000000001';
  mocks.agy.mockResolvedValue({verifiedUrls:new Set(),googleCitationUrls:new Set(),searchPerformed:true,jobs:[{url}]});
  expect(await searchCitedUrls('Find verified publisher pages','owner')).toEqual({available:true,urls:[url]});
  mocks.agy.mockResolvedValue({verifiedUrls:new Set(),googleCitationUrls:new Set(),searchPerformed:false,jobs:[{url}]});
  expect((await searchCitedUrls('Find verified publisher pages','owner')).urls).toEqual([]);
});
it('keeps individual search results ahead of unrelated native source links within the URL budget',async()=>{
 const url='https://jobs.lever.co/company/00000000-0000-4000-8000-000000000001';
 mocks.agy.mockResolvedValue({verifiedUrls:new Set(Array.from({length:8},(_,i)=>`https://example.com/source-${i}`)),googleCitationUrls:new Set(),searchPerformed:true,jobs:[{url}]});
 expect((await searchCitedUrls('Find verified publisher pages','owner')).urls[0]).toBe(url);
});
it('preserves independently verifiable Gemini job hints only when Google Search actually ran',async()=>{
 const job={title:'Auxiliar administrativo',company:'Empresa',url:'https://empresa.example/jobs/1',location:'Brasil',description:'Rotinas administrativas em uma empresa brasileira.'};
 mocks.api.mockResolvedValue({text:JSON.stringify({jobs:[job]}),grounding:{webSearchQueries:['auxiliar administrativo'],groundingChunks:[]}});
 expect((await searchCitedUrls('Find public jobs','another-user')).urls).toEqual([job.url]);
 mocks.api.mockResolvedValue({text:JSON.stringify({jobs:[job]}),grounding:{groundingChunks:[]}});
 expect((await searchCitedUrls('Find public jobs','another-user')).urls).toEqual([]);
});
