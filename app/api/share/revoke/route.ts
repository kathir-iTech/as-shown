import { revokeSeller } from "@/provider/sharing";
import { safeError } from "@/provider/youcam";
export async function POST(request: Request) {
  try {
    return await revokeSeller(request);
  } catch (error) {
    return safeError(error);
  }
}
