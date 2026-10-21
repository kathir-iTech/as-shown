import { publishSeller } from "@/provider/sharing";
import { safeError } from "@/provider/youcam";
export const maxDuration = 90;
export async function POST(request: Request) {
  try {
    return await publishSeller(request);
  } catch (error) {
    return safeError(error);
  }
}
