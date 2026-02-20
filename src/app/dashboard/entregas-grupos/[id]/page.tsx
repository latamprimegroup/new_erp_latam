import { EntregasGruposDetailClient } from './EntregasGruposDetailClient'

export default async function EntregasGruposDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <EntregasGruposDetailClient id={id} />
}
