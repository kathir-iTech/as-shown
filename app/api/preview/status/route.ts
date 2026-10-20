import { previewStatus, safeError } from "@/provider/youcam";
export async function POST(request: Request) {
  try {
    return await previewStatus(request);
  } catch (error) {
    return safeError(error);
  }
}
