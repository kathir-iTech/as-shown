import { previewResult, safeError } from "@/provider/youcam";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    return await previewResult(request);
  } catch (error) {
    return safeError(error);
  }
}
