import { createPreview, safeError } from "@/provider/youcam";
export const maxDuration = 90;
export async function POST(request: Request) {
  try {
    return await createPreview(request);
  } catch (error) {
    return safeError(error);
  }
}
