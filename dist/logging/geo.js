export function extractClientIp(req) {
    const flyHeader = req.headers['fly-client-ip'];
    if (typeof flyHeader === 'string' && flyHeader.trim()) {
        return flyHeader.trim();
    }
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
        const first = xff.split(',')[0]?.trim();
        if (first)
            return first;
    }
    const socket = req.socket?.remoteAddress;
    if (socket)
        return socket;
    return undefined;
}
//# sourceMappingURL=geo.js.map