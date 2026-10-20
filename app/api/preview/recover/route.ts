import { previewRecovery, safeError } from "@/provider/youcam";

export async function POST(request: Request) {
  try {
    return await previewRecovery(request);
  } catch (error) {
    return safeError(error);
  }
}
