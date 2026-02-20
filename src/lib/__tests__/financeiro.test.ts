/**
 * Testes de lógica financeira (DRE, fluxo de caixa)
 * Execute: npm run test
 */
import { describe, it, expect } from 'vitest'

function calcularDRE(receitas: number, despesas: number) {
  return receitas - despesas
}

function calcularFluxoProjetado(
  saldoAtual: number,
  mediaReceita: number,
  mediaDespesa: number,
  meses: number
) {
  const resultado = [saldoAtual]
  for (let i = 0; i < meses; i++) {
    resultado.push(resultado[resultado.length - 1] + mediaReceita - mediaDespesa)
  }
  return resultado
}

describe('Financeiro - DRE', () => {
  it('resultado positivo quando receitas > despesas', () => {
    expect(calcularDRE(10000, 6000)).toBe(4000)
  })

  it('resultado negativo quando despesas > receitas', () => {
    expect(calcularDRE(5000, 8000)).toBe(-3000)
  })

  it('resultado zero quando receitas = despesas', () => {
    expect(calcularDRE(5000, 5000)).toBe(0)
  })
})

describe('Financeiro - Fluxo projetado', () => {
  it('projeta corretamente para 3 meses', () => {
    const saldoInicial = 1000
    const projecao = calcularFluxoProjetado(saldoInicial, 5000, 4000, 3)
    expect(projecao).toHaveLength(4)
    expect(projecao[0]).toBe(1000)
    expect(projecao[1]).toBe(2000)
    expect(projecao[2]).toBe(3000)
    expect(projecao[3]).toBe(4000)
  })

  it('saldo diminui quando despesas > receitas', () => {
    const projecao = calcularFluxoProjetado(5000, 2000, 3000, 2)
    expect(projecao[1]).toBe(4000)
    expect(projecao[2]).toBe(3000)
  })
})
