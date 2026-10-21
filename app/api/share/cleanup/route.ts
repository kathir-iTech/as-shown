import { cleanSellerRecords } from "@/provider/sharing";
import { safeError } from "@/provider/youcam";
export async function GET(request: Request) {
  try {
    return await cleanSellerRecords(request);
  } catch (error) {
    return safeError(error);
  }
}
