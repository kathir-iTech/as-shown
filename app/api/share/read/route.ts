import { readSeller } from "@/provider/sharing";
import { safeError } from "@/provider/youcam";
export async function POST(request: Request) {
  try {
    return await readSeller(request);
  } catch (error) {
    return safeError(error);
  }
}
