import { Prisma, type TrackerConversionRule, TrackerConversionValueMode } from '@prisma/client'

export function computeConversionSendValue(
  amountGross: Prisma.Decimal,
  rule: Pick<
    TrackerConversionRule,
    'valueMode' | 'platformFeePercent' | 'conversionWeightPercent'
  >
): Prisma.Decimal {
  if (rule.valueMode === TrackerConversionValueMode.MICRO_ZERO) {
    return new Prisma.Decimal(0)
  }

  let v = new Prisma.Decimal(amountGross.toString())
  if (
    rule.valueMode === TrackerConversionValueMode.NET_AFTER_PLATFORM_FEE &&
    rule.platformFeePercent != null
  ) {
    const pct = new Prisma.Decimal(rule.platformFeePercent.toString()).div(100)
    v = v.mul(new Prisma.Decimal(1).minus(pct))
  }

  const w = new Prisma.Decimal(rule.conversionWeightPercent).div(100)
  return v.mul(w)
}
