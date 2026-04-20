import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

const ROOT = path.join(process.cwd(), 'uploads', 'gatekeeper')

export async function saveGatekeeperIdDoc(buffer: Buffer, photoHash: string): Promise<string> {
  const dir = path.join(ROOT, 'ids')
  await mkdir(dir, { recursive: true })
  const filename = `${photoHash}.png`
  const abs = path.join(dir, filename)
  await writeFile(abs, buffer)
  return path.posix.join('gatekeeper', 'ids', filename)
}
