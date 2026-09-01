import {
  AlertCircle,
  ArrowRight,
  Github,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RepoInfo, Session } from '@/lib/session';

export function ConnectPanel({ onConnect }: { onConnect: (s: Session) => void }) {
  const [token, setToken] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parseRepo(value: string) {
    let cleaned = value.trim();
    const lower = cleaned.toLowerCase();

    for (const prefix of ['https://github.com/', 'http://github.com/']) {
      if (lower.startsWith(prefix)) {
        cleaned = cleaned.slice(prefix.length);
        break;
      }
    }

    if (cleaned.endsWith('.git')) {
      cleaned = cleaned.slice(0, -4);
    }

    while (cleaned.endsWith('/')) {
      cleaned = cleaned.slice(0, -1);
    }

    const [owner, repo] = cleaned.split('/');
    return { owner: owner ?? '', repo: repo ?? '' };
  }

  async function connect(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { owner, repo } = parseRepo(repoUrl);
    if (!token.trim() || !owner || !repo) {
      setError('Informe o token e o repositório no formato owner/repo.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/repo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'connect',
          token: token.trim(),
          owner,
          repo,
          branch: branch.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        info?: RepoInfo;
        branch?: string;
        error?: string;
      };
      if (!res.ok || !data.info) throw new Error(data.error ?? 'Falha ao conectar');
      onConnect({
        token: token.trim(),
        owner,
        repo,
        branch: data.branch ?? data.info.defaultBranch,
        info: data.info,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className='app-shell-bg relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10'>
      <div aria-hidden='true' className='pointer-events-none absolute inset-0'>
        <div className='absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/20 blur-3xl' />
        <div className='absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl' />
        <div className='absolute top-1/3 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl' />
      </div>

      <div className='relative w-full max-w-lg'>
        <div className='mb-10 text-center'>
          <div className='relative mx-auto mb-5 inline-flex'>
            <div className='absolute inset-0 rounded-2xl bg-primary/50 blur-xl' />
            <div className='relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg ring-1 ring-white/25'>
              <Github className='h-8 w-8' />
            </div>
          </div>
          <div className='mx-auto mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary'>
            <Sparkles className='h-4 w-4' />
          </div>
          <h1 className='text-3xl font-semibold tracking-tight sm:text-4xl'>Brasas Agent</h1>
          <p className='mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground'>
            Conecte seu repositório e deixe o agente editar, commitar e enviar as mudanças
            automaticamente — com precisão cirúrgica.
          </p>
        </div>

        <form
          onSubmit={connect}
          className='surface-panel relative overflow-hidden rounded-2xl p-6 shadow-2xl backdrop-blur-xl sm:p-8'
        >
          <div className='absolute inset-x-0 top-0 h-px bg-primary/60' />

          <div className='space-y-2'>
            <Label htmlFor='token' className='flex items-center gap-2 text-xs tracking-wide uppercase'>
              <KeyRound className='h-3.5 w-3.5 text-primary' />
              GitHub Access Token
            </Label>
            <div className='relative'>
              <KeyRound className='pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                id='token'
                type='password'
                autoComplete='off'
                placeholder='ghp_...'
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className='h-11 pl-10'
              />
            </div>
            <p className='text-xs text-muted-foreground'>
              Token clássico ou fine-grained com permissão de leitura e escrita em Contents.
            </p>
          </div>

          <div className='mt-5 space-y-2'>
            <Label htmlFor='repo' className='text-xs tracking-wide uppercase'>
              Repositório
            </Label>
            <Input
              id='repo'
              placeholder='owner/repositorio'
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className='h-11'
            />
          </div>

          <div className='mt-5 space-y-2'>
            <Label htmlFor='branch' className='text-xs tracking-wide uppercase'>
              Branch <span className='normal-case opacity-60'>(opcional)</span>
            </Label>
            <Input
              id='branch'
              placeholder='main'
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className='h-11'
            />
          </div>

          {error ? (
            <div className='mt-5 flex items-start gap-2 rounded-xl border border-destructive/35 bg-destructive/8 p-3.5 text-sm text-destructive'>
              <AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
              <span className='break-words'>{error}</span>
            </div>
          ) : null}

          <Button
            type='submit'
            size='lg'
            className='mt-6 h-12 w-full gap-2 rounded-xl text-sm font-semibold shadow-lg'
          >
            {loading ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <ArrowRight className='h-4 w-4' />
            )}
            {loading ? 'Conectando...' : 'Conectar projeto'}
          </Button>

          <div className='mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground'>
            <ShieldCheck className='h-3.5 w-3.5 text-primary' />
            Suas credenciais ficam apenas neste navegador.
          </div>
        </form>

        <div className='mt-6 grid grid-cols-3 gap-3 text-center'>
          {[
            ['Leitura', 'estrutura real'],
            ['Edição', 'no local exato'],
            ['Commit', '+ push automático'],
          ].map(([a, b]) => (
            <div key={a} className='rounded-xl border border-border/60 bg-surface/60 px-2 py-3'>
              <p className='text-xs font-semibold'>{a}</p>
              <p className='text-[11px] text-muted-foreground'>{b}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
