'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { cadastroLojistaAction } from '@/lib/actions'

const UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export default function CadastroLojistaPage() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await cadastroLojistaAction(new FormData(form))
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="auth-layout">
      <div className="auth-card animate-slide-up" style={{ maxWidth: 600 }}>
        <div className="auth-logo">
          <div className="auth-logo-icon">🏪</div>
          <h1 className="auth-title">Cadastrar Petshop</h1>
          <p className="auth-subtitle">Crie sua conta e comece a receber agendamentos</p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="nome_loja" className="form-label form-label-required">Nome do Estabelecimento</label>
            <input id="nome_loja" name="nome_loja" type="text" className="form-input" placeholder="PetShop do Bairro" required />
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="email" className="form-label form-label-required">E-mail</label>
              <input id="email" name="email" type="email" className="form-input" placeholder="contato@petshop.com" required />
            </div>
            <div className="form-group">
              <label htmlFor="telefone" className="form-label form-label-required">Telefone</label>
              <input id="telefone" name="telefone" type="tel" className="form-input" placeholder="(11) 99999-9999" required />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="descricao" className="form-label">Descrição</label>
            <textarea id="descricao" name="descricao" className="form-textarea" placeholder="Conte um pouco sobre seu petshop..." rows={3} />
          </div>

          <div className="form-group">
            <label htmlFor="endereco" className="form-label">Endereço</label>
            <input id="endereco" name="endereco" type="text" className="form-input" placeholder="Rua das Flores, 123" />
          </div>

          <div className="form-grid-3">
            <div className="form-group" style={{ gridColumn: 'span 1' }}>
              <label htmlFor="cidade" className="form-label">Cidade</label>
              <input id="cidade" name="cidade" type="text" className="form-input" placeholder="São Paulo" />
            </div>
            <div className="form-group">
              <label htmlFor="estado" className="form-label">Estado</label>
              <select id="estado" name="estado" className="form-select">
                <option value="">UF</option>
                {UF.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="cep" className="form-label">CEP</label>
              <input id="cep" name="cep" type="text" className="form-input" placeholder="00000-000" maxLength={9} />
            </div>
          </div>

          <div className="separator" />

          <div className="form-group">
            <label htmlFor="senha" className="form-label form-label-required">Senha</label>
            <input id="senha" name="senha" type="password" className="form-input" placeholder="Mín. 8 chars, 1 maiúscula, 1 número, 1 especial" required />
          </div>

          <div className="form-group">
            <label htmlFor="confirmaSenha" className="form-label form-label-required">Confirmar senha</label>
            <input id="confirmaSenha" name="confirmaSenha" type="password" className="form-input" placeholder="••••••••" required />
          </div>

          <button
            type="submit"
            id="btn-cadastro-lojista"
            className={`btn btn-primary btn-full btn-lg ${isPending ? 'btn-loading' : ''}`}
            disabled={isPending}
          >
            {isPending ? 'Cadastrando...' : 'Cadastrar Petshop'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 'var(--space-5)', fontSize: '0.9rem', color: 'var(--gray-500)' }}>
          Já tem conta?{' '}
          <Link href="/login" style={{ color: 'var(--primary-400)', fontWeight: 600 }}>Entrar</Link>
        </p>
      </div>
    </div>
  )
}
