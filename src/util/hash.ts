import { createHash } from 'node:crypto';

export const hash = (data: string | Buffer, len = 8) => createHash('sha1').update(data).digest('hex').slice(0, len);
