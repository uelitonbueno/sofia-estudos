import { useAuth } from "@/_core/hooks/useAuth";
import { EmptyState, HudPanel, PageHeader, StatusPill } from "@/components/SofiaPrimitives";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { newSubjectPath } from "@/lib/studyRoutes";
import { ArrowRight, BookOpen, BrainCircuit, CalendarClock, Flame, FolderPlus, Loader2, Plus, Sparkles, Trophy } from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.dashboard.get.useQuery();
  const name = data?.profile.displayName || user?.name?.split(" ")[0] || "Estudante";

  if (isLoading) return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="size-7 animate-spin text-cyan-300" /></div>;
  const levelProgress = ((data?.progress.totalXp || 0) % 300) / 3;
  const metrics = [
    { label: "Revisões em espera", value: data?.dueCards.length || 0, icon: CalendarClock, color: "text-cyan-300", hint: "flashcards para hoje" },
    { label: "XP acumulado", value: data?.progress.totalXp || 0, icon: Trophy, color: "text-fuchsia-300", hint: "sua energia de estudo" },
    { label: "Score de domínio", value: `${data?.masteryScore || 0}%`, icon: Flame, color: "text-amber-300", hint: "média dos quizzes corrigidos" },
  ];

  return <div className="mx-auto max-w-7xl">
    <PageHeader eyebrow="Núcleo de aprendizagem" title={<>Olá, <span className="text-fuchsia-400">{name}</span>.</>} description="Seu sistema está pronto para transformar materiais em uma rotina de estudo inteligente." action={<Button onClick={() => navigate(data?.subjects.length ? "/materiais" : newSubjectPath)} className="neon-button gap-2"><Plus className="size-4" />{data?.subjects.length ? "Adicionar material" : "Criar disciplina"}</Button>} />

    <div className="grid gap-4 md:grid-cols-3">
      {metrics.map(metric => <HudPanel key={metric.label} className="scan-line p-5">
        <div className="flex items-start justify-between"><span className="hud-label">{metric.label}</span><metric.icon className={`size-5 ${metric.color}`} /></div>
        <p className={`metric-glow mt-5 text-4xl font-black ${metric.color}`}>{metric.value}</p>
        <p className="mt-1 text-xs text-slate-500">{metric.hint}</p>
      </HudPanel>)}
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
      <HudPanel className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="hud-label">Fase atual</p><h2 className="mt-2 text-xl font-bold text-white">Nível {data?.progress.currentLevel || 1} <span className="text-cyan-300">· Sinal em ascensão</span></h2></div><StatusPill tone="pink">{data?.progress.currentStreak || 0} dias de sequência</StatusPill></div>
        <div className="mt-8"><div className="mb-2 flex justify-between text-xs"><span className="text-slate-400">Próximo nível</span><span className="font-mono text-cyan-200">{data?.progress.totalXp || 0} XP</span></div><Progress value={levelProgress} className="h-2.5 bg-white/5 [&>div]:bg-gradient-to-r [&>div]:from-fuchsia-500 [&>div]:to-cyan-400" /></div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2"><button onClick={() => navigate("/estudar")} className="soft-button group flex items-center gap-3 rounded-xl p-4 text-left transition"><div className="rounded-lg bg-cyan-300/10 p-2 text-cyan-200"><BrainCircuit className="size-5" /></div><div><p className="font-bold text-slate-100">Criar sessão IA</p><p className="mt-0.5 text-xs text-slate-500">Resumo, quiz ou flashcards</p></div><ArrowRight className="ml-auto size-4 opacity-0 transition group-hover:opacity-100" /></button><button onClick={() => navigate("/tutor")} className="soft-button group flex items-center gap-3 rounded-xl p-4 text-left transition"><div className="rounded-lg bg-fuchsia-300/10 p-2 text-fuchsia-200"><Sparkles className="size-5" /></div><div><p className="font-bold text-slate-100">Conversar com tutor</p><p className="mt-0.5 text-xs text-slate-500">Dúvidas sobre seus materiais</p></div><ArrowRight className="ml-auto size-4 opacity-0 transition group-hover:opacity-100" /></button></div>
      </HudPanel>

      <HudPanel className="p-5 sm:p-6"><p className="hud-label">Próxima ação</p>{(data?.dueCards.length || 0) > 0 ? <><div className="mt-5 flex size-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><CalendarClock className="size-6" /></div><h2 className="mt-4 text-2xl font-bold text-white">{data?.dueCards.length} revisões disponíveis</h2><p className="mt-2 text-sm leading-6 text-slate-400">Uma revisão curta agora ajuda sua memória a consolidar o conteúdo no ritmo certo.</p><Button onClick={() => navigate("/estudar")} className="neon-button mt-6 w-full">Iniciar revisões</Button></> : <><div className="mt-5 flex size-12 items-center justify-center rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-200"><BookOpen className="size-6" /></div><h2 className="mt-4 text-2xl font-bold text-white">{data?.subjects.length ? "Alimente sua base" : "Crie sua disciplina"}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{data?.subjects.length ? "Importe um material para gerar seu primeiro conjunto de estudo personalizado." : "Comece organizando sua primeira matéria para que a SOF-IA possa estudar o seu contexto."}</p><Button onClick={() => navigate(data?.subjects.length ? "/materiais" : newSubjectPath)} className="neon-button mt-6 w-full">{data?.subjects.length ? "Importar conteúdo" : "Criar disciplina"}</Button></>}</HudPanel>
    </div>

    <section className="mt-7"><div className="mb-4 flex items-center justify-between"><div><p className="hud-label">Disciplinas ativas</p><h2 className="mt-1 text-xl font-bold text-white">Sua base de conhecimento</h2></div><Button variant="ghost" onClick={() => navigate("/disciplinas")} className="text-cyan-200 hover:bg-cyan-300/10 hover:text-cyan-100">Gerenciar <ArrowRight className="ml-2 size-4" /></Button></div>{data?.subjects.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.subjects.slice(0, 6).map(subject => { const count = data.materials.filter(material => material.subjectId === subject.id).length; return <button key={subject.id} onClick={() => navigate("/materiais")} className="hud-panel group p-5 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/45"><div className="flex items-start justify-between"><span className="flex size-10 items-center justify-center rounded-xl border" style={{ borderColor: `${subject.color}80`, backgroundColor: `${subject.color}18`, color: subject.color }}><BookOpen className="size-5" /></span><StatusPill tone="slate">{count} materiais</StatusPill></div><h3 className="mt-5 text-lg font-bold text-slate-100">{subject.name}</h3><p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">{subject.description || "Disciplina pronta para receber seu próximo conteúdo."}</p></button>; })}</div> : <EmptyState icon={<FolderPlus className="size-6" />} title="Sua primeira disciplina começa aqui" description="Crie uma pasta para organizar materiais, gerar revisões e acompanhar seu domínio." action={<Button onClick={() => navigate(newSubjectPath)} className="neon-button"><Plus className="mr-2 size-4" />Criar minha disciplina</Button>} />}</section>
  </div>;
}
