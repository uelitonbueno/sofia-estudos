import { EmptyState, HudPanel, PageHeader, StatusPill } from "@/components/SofiaPrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { BookOpen, FolderPlus, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const colors = ["#22D3EE", "#E879F9", "#A3E635", "#FBBF24", "#818CF8", "#FB7185"];

export default function Subjects() {
  const utils = trpc.useUtils();
  const { data: subjects, isLoading } = trpc.subjects.list.useQuery();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [color, setColor] = useState(colors[0]);
  const create = trpc.subjects.create.useMutation({ onSuccess: () => { utils.subjects.list.invalidate(); utils.dashboard.get.invalidate(); reset(); toast.success("Disciplina criada."); }, onError: error => toast.error(error.message) });
  const update = trpc.subjects.update.useMutation({ onSuccess: () => { utils.subjects.list.invalidate(); utils.dashboard.get.invalidate(); reset(); toast.success("Disciplina atualizada."); }, onError: error => toast.error(error.message) });
  const remove = trpc.subjects.remove.useMutation({ onSuccess: () => { utils.subjects.list.invalidate(); utils.dashboard.get.invalidate(); toast.success("Disciplina removida."); }, onError: error => toast.error(error.message) });
  const reset = () => { setCreating(false); setEditingId(null); setName(""); setDescription(""); setColor(colors[0]); };
  const openEdit = (subject: NonNullable<typeof subjects>[number]) => { setEditingId(subject.id); setName(subject.name); setDescription(subject.description || ""); setColor(subject.color); setCreating(true); };
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (editingId) update.mutate({ id: editingId, values: { name, description, color } }); else create.mutate({ name, description, color }); };
  return <div className="mx-auto max-w-7xl"><PageHeader eyebrow="Organização neural" title={<>Suas <span className="text-cyan-300">disciplinas</span></>} description="Cada disciplina agrupa materiais e direciona o contexto do seu tutor inteligente." action={<Button onClick={() => { reset(); setCreating(true); }} className="neon-button gap-2"><Plus className="size-4" />Nova disciplina</Button>} />
    {creating && <HudPanel className="mb-6 p-5"><form onSubmit={submit} className="grid gap-4 lg:grid-cols-[1fr_1.3fr_auto]"><div><label className="hud-label">Nome</label><Input className="mt-2 bg-black/20" placeholder="Ex.: Biologia" value={name} onChange={e => setName(e.target.value)} autoFocus /></div><div><label className="hud-label">Descrição</label><Input className="mt-2 bg-black/20" placeholder="O que você está aprendendo?" value={description} onChange={e => setDescription(e.target.value)} /></div><div className="flex items-end gap-2"><div className="flex gap-1.5">{colors.map(item => <button type="button" aria-label={`Cor ${item}`} onClick={() => setColor(item)} key={item} className={`size-7 rounded-full border-2 ${color === item ? "border-white" : "border-transparent"}`} style={{ backgroundColor: item }} />)}</div><Button disabled={!name.trim() || create.isPending || update.isPending} className="neon-button">{create.isPending || update.isPending ? <Loader2 className="size-4 animate-spin" /> : editingId ? "Salvar" : "Criar"}</Button><Button type="button" variant="ghost" onClick={reset}>Cancelar</Button></div></form></HudPanel>}
    {isLoading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-cyan-300" /></div> : subjects?.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{subjects.map(subject => <HudPanel key={subject.id} className="group p-5"><div className="flex items-start justify-between"><div className="flex size-12 items-center justify-center rounded-2xl border" style={{ borderColor: `${subject.color}80`, backgroundColor: `${subject.color}16`, color: subject.color }}><BookOpen className="size-6" /></div><div className="flex items-center gap-2"><StatusPill tone="slate">Ativa</StatusPill><button onClick={() => openEdit(subject)} className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-cyan-200" aria-label={`Editar ${subject.name}`}><Pencil className="size-4" /></button></div></div><h2 className="mt-6 text-xl font-bold text-white">{subject.name}</h2><p className="mt-2 min-h-11 text-sm leading-5 text-slate-500">{subject.description || "Sem descrição. Adicione materiais para iniciar."}</p><div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4"><span className="font-mono text-[10px] uppercase tracking-[.14em] text-slate-600">Base de estudo</span><button onClick={() => { if (confirm(`Excluir “${subject.name}” e seus materiais?`)) remove.mutate({ id: subject.id }); }} className="rounded-md p-1.5 text-slate-600 hover:bg-rose-400/10 hover:text-rose-300"><Trash2 className="size-4" /></button></div></HudPanel>)}</div> : <EmptyState icon={<FolderPlus className="size-6" />} title="Nenhuma disciplina criada" description="Crie uma disciplina para separar seus materiais e deixar a IA entender seu contexto de estudo." />}
  </div>;
}
