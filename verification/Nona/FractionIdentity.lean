import Nona.Numeric

namespace Nona.Numeric

private def mag (f : Fraction) := f.whole * f.denominator + f.numerator

private theorem mag_odd (f : Fraction) : mag f % 2 = 1 := by
  simp [mag, Fraction.denominator, Nat.pow_succ, Nat.add_mod, Nat.mul_mod, f.odd]

/-- With an odd numerator a dyadic cannot have two different reduced
denominator exponents. The more deeply divided side would have to be even. -/
private theorem no_smaller_shift (f g : Fraction) (h : f.shift < g.shift)
    (same : mag f * g.denominator = mag g * f.denominator) : False := by
  let k := g.shift - f.shift - 1
  have exponents : g.shift + 1 = (k + 1) + (f.shift + 1) := by dsimp [k]; omega
  have den : g.denominator = 2 ^ (k+1) * f.denominator := by
    unfold Fraction.denominator
    rw [exponents, Nat.pow_add]
  rw [den, ← Nat.mul_assoc] at same
  have positive : 0 < f.denominator := Nat.two_pow_pos _
  have cancel := Nat.eq_of_mul_eq_mul_right positive same
  have odd := mag_odd g
  rw [← cancel] at odd
  simp [Nat.pow_succ, Nat.mul_mod] at odd

/-- For finite fractional magnitudes, cross multiplication compares the
mathematical dyadics directly. If signs and values agree, fields agree. -/
theorem fraction_identity (f g : Fraction) :
    (f.negative = g.negative ∧
      (f.whole * f.denominator + f.numerator) * g.denominator =
      (g.whole * g.denominator + g.numerator) * f.denominator) ↔ f = g := by
  constructor
  · rintro ⟨sign, value⟩
    change mag f * g.denominator = mag g * f.denominator at value
    have shifts : f.shift = g.shift := by
      exact Nat.le_antisymm (Nat.le_of_not_gt (fun h => no_smaller_shift g f h value.symm))
        (Nat.le_of_not_gt (fun h => no_smaller_shift f g h value))
    have den : f.denominator = g.denominator := congrArg (fun k : Nat => 2^(k+1)) shifts
    have positive : 0 < f.denominator := Nat.two_pow_pos _
    rw [← den] at value
    have mags := Nat.eq_of_mul_eq_mul_right positive value
    have residues := congrArg (fun n => n % f.denominator) mags
    change mag f % f.denominator = mag g % f.denominator at residues
    have num : f.numerator = g.numerator := by
      calc
        f.numerator = mag f % f.denominator := (fraction_residue f).symm
        _ = mag g % f.denominator := residues
        _ = mag g % g.denominator := by rw [den]
        _ = g.numerator := fraction_residue g
    unfold mag at mags
    rw [← den, ← num] at mags
    have whole := Nat.eq_of_mul_eq_mul_right positive (Nat.add_right_cancel mags)
    cases f
    cases g
    simp_all
  · rintro rfl
    exact ⟨rfl, rfl⟩

/-- This is the fractional branch of strict numeric equality, expressed via
signed rational value instead of equality of the stored canonical fields. -/
theorem numberEq_fraction_iff (f g : Fraction) :
    numberEq (.fraction f) (.fraction g) ↔
      f.negative = g.negative ∧
      (f.whole * f.denominator + f.numerator) * g.denominator =
      (g.whole * g.denominator + g.numerator) * f.denominator := by
  rw [fraction_identity]
  simp [numberEq, integerValue]

end Nona.Numeric