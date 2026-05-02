import {createHash} from "crypto";

export class KidUtil {
    static generate(tenantId: string, keyVersion: number): string {
        return createHash("sha256")
            .update(`${tenantId}:${keyVersion}`)
            .digest("hex")
            .substring(0, 16);
    }
}
