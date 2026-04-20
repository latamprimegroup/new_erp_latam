import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { TrainingProtection } from '@/components/training/TrainingProtection'
import { IpWatermark } from '@/components/training/IpWatermark'

const BASE_ITEMS = [
  { id: 'vid-1', title: 'Playbook de aquecimento seguro', type: 'video', src: '/training/playbook-aquecimento.mp4' },
  { id: 'pdf-1', title: 'Checklist de produção segura', type: 'pdf', src: '/training/checklist-producao.pdf' },
]

const MANAGER_ITEMS = [
  { id: 'vid-m-1', title: 'Auditoria de qualidade operacional', type: 'video', src: '/training/auditoria-qualidade.mp4' },
  { id: 'pdf-m-1', title: 'Matriz de decisão de contingência', type: 'pdf', src: '/training/matriz-contingencia.pdf' },
]

export default async function TreinamentoPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const role = session.user?.role || ''
  const allowed = ['ADMIN', 'PRODUCER', 'PRODUCTION_MANAGER', 'FINANCE', 'DELIVERER', 'COMMERCIAL', 'MANAGER']
  if (!allowed.includes(role)) redirect('/dashboard')

  const items = role === 'MANAGER' || role === 'ADMIN' ? [...BASE_ITEMS, ...MANAGER_ITEMS] : BASE_ITEMS

  return (
    <div className="relative">
      <TrainingProtection />
      <IpWatermark email={session.user?.email || 'sem-email'} role={role} />

      <h1 className="heading-1 mb-2">Area de Treinamento Blindada</h1>
      <p className="text-sm text-gray-400 mb-6">
        Conteudo interno com marca d&apos;agua dinamica, visualizacao protegida e trilhas por permissao.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item) => (
          <article key={item.id} className="card border-violet-500/20">
            <p className="text-xs text-violet-400 mb-2">{item.type === 'video' ? 'Video Tutorial' : 'Documento PDF'}</p>
            <h2 className="font-semibold mb-3">{item.title}</h2>
            {item.type === 'video' ? (
              <video
                src={item.src}
                controls
                controlsList="nodownload noplaybackrate noremoteplayback"
                disablePictureInPicture
                className="w-full rounded-lg bg-black"
              />
            ) : (
              <iframe
                src={`${item.src}#toolbar=0&navpanes=0&scrollbar=1`}
                className="w-full h-72 rounded-lg border border-white/10 bg-white"
                title={item.title}
              />
            )}
          </article>
        ))}
      </div>
    </div>
  )
}
