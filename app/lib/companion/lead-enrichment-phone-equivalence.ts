// Porta fiel de buildPhoneVariants/areEquivalentPhones
// (app/extension/yolen-companion/src/lead-enrichment.js) para o servidor —
// MESMO algoritmo de variantes de DDD/nono dígito, nunca uma segunda regra
// de equivalência de telefone. Usada por
// app/api/companion/lead-enrichment-context/route.ts para comparar um
// candidato de telefone extraído da conversa contra o telefone atual do
// lead SEM jamais devolver o telefone atual ao content script (hardening
// de telefone do ManyChat, ver manychat-capture-runtime.js
// #sanitizeLeadResolutionPayload).

function onlyDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

function hasRepeatedDigits(value: string) {
  return /^(\d)\1+$/.test(value)
}

function normalizePhone(value: unknown) {
  const digits = onlyDigits(value)

  if (
    digits.length < 10 ||
    digits.length > 13 ||
    hasRepeatedDigits(digits)
  ) {
    return null
  }

  return digits
}

function buildPhoneVariants(value: unknown) {
  const digits = normalizePhone(value)
  const variants = new Set<string>()

  if (!digits) {
    return variants
  }

  variants.add(digits)

  const local =
    digits.startsWith('55') &&
    (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits

  if (local.length === 10 || local.length === 11) {
    variants.add(local)
    variants.add(`55${local}`)

    const ddd = local.slice(0, 2)

    if (local.length === 10) {
      const withNinthDigit = `${ddd}9${local.slice(2)}`
      variants.add(withNinthDigit)
      variants.add(`55${withNinthDigit}`)
    }

    if (local.length === 11 && local[2] === '9') {
      const withoutNinthDigit = `${ddd}${local.slice(3)}`
      variants.add(withoutNinthDigit)
      variants.add(`55${withoutNinthDigit}`)
    }
  }

  return variants
}

export function areEquivalentPhones(
  first: unknown,
  second: unknown,
) {
  const firstVariants = buildPhoneVariants(first)
  const secondVariants = buildPhoneVariants(second)

  for (const variant of firstVariants) {
    if (secondVariants.has(variant)) {
      return true
    }
  }

  return false
}
