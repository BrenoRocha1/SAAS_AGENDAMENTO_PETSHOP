// Movimentos do controle segmentado (../segmented-control.tsx).
//
// SAIP: este arquivo não veio junto com o componente (21st.dev) — só o
// import dele. Foi escrito aqui com o que o componente usa.
export const motionTokens = {
  spring: {
    // A seleção deslizando de uma opção pra outra: rápida e sem balanço.
    morph: { type: "spring", stiffness: 520, damping: 42, mass: 0.9 },
  },
} as const;
