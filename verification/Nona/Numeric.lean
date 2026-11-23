import Std

/-!
Numeric model for integer-ops.ts. Finite values are canonical dyadics, not
binary64 bit strings. The domain overapproximates binary64's exponent/range.
Target conversion, flag and instruction correspondence remains an obligation;
no hardware facts are introduced as axioms. See docs/formal-verification.md.
-/
namespace Nona.Numeric

/-- Proper fractional part: odd numerator / 2^(shift+1). Together with the
nonnegative whole part and sign this is a unique numerical representation.
Clients must reduce trailing factors of two before constructing a fraction. -/
structure Fraction where
  negative : Bool
  whole : Nat
  numerator : Nat
  shift : Nat
  positive : 0 < numerator
  proper : numerator < 2 ^ (shift + 1)
  odd : numerator % 2 = 1
  deriving DecidableEq

def Fraction.denominator (f : Fraction) : Nat := 2 ^ (f.shift + 1)

/-- Rational magnitude is whole + numerator/denominator. The proper residue
both justifies truncation and rules out a disguised integral fraction. -/
theorem fraction_residue (f : Fraction) :
    (f.whole * f.denominator + f.numerator) % f.denominator = f.numerator := by
  simp [Nat.add_mod, Nat.mul_mod, Nat.mod_eq_of_lt f.proper, Fraction.denominator]

theorem fraction_quotient (f : Fraction) :
    (f.whole * f.denominator + f.numerator) / f.denominator = f.whole := by
  have positive : 0 < f.denominator := Nat.two_pow_pos (f.shift + 1)
  have proper : f.numerator < f.denominator := f.proper
  rw [Nat.mul_comm f.whole f.denominator, Nat.mul_add_div positive,
    Nat.div_eq_of_lt proper, Nat.add_zero]

theorem fraction_nonintegral (f : Fraction) :
    ¬ f.denominator ∣ f.whole * f.denominator + f.numerator := by
  intro h
  have zero := Nat.mod_eq_zero_of_dvd h
  rw [fraction_residue] at zero
  have := f.positive
  omega

inductive Number where
  | integer (value : Int) -- includes positive zero
  | fraction (value : Fraction)
  | negativeZero
  | nan
  | positiveInfinity
  | negativeInfinity
  deriving DecidableEq

def finite : Number → Bool
  | .integer _ | .fraction _ | .negativeZero => true
  | _ => false

/-- Finite integral numerical identity; deliberately forgets the zero sign. -/
def integerValue : Number → Option Int
  | .integer n => some n
  | .negativeZero => some 0
  | _ => none

def negativeZero : Number → Bool
  | .negativeZero => true
  | _ => false

/-- Strict numerical equality, usable independently by the switch model. -/
def numberEq (x y : Number) : Prop :=
  x ≠ .nan ∧ y ≠ .nan ∧
    (x = y ∨ (integerValue x).isSome = true ∧ integerValue x = integerValue y)

instance (x y : Number) : Decidable (numberEq x y) := by
  unfold numberEq
  exact inferInstance

def unordered (x y : Number) : Prop := x = .nan ∨ y = .nan

instance (x y : Number) : Decidable (unordered x y) := by
  unfold unordered
  exact inferInstance

/-- UCOMISD's ZF is also set on unordered inputs. PF must be considered. -/
def equalFlag (x y : Number) : Prop := unordered x y ∨ numberEq x y

instance (x y : Number) : Decidable (equalFlag x y) := by
  unfold equalFlag
  exact inferInstance

theorem ordered_equal (x y : Number) :
    (¬ unordered x y ∧ equalFlag x y) ↔ numberEq x y := by
  constructor
  · rintro ⟨ordered, equal⟩
    exact equal.resolve_left ordered
  · intro h
    exact ⟨fun u => u.elim h.1 h.2.1, Or.inr h⟩

theorem integer_comparison (n : Int) (x : Number) :
    numberEq (.integer n) x ↔ integerValue x = some n := by
  cases x <;> simp [numberEq, integerValue, eq_comm]

theorem fraction_comparison (f g : Fraction) :
    numberEq (.fraction f) (.fraction g) ↔ f = g := by
  simp [numberEq, integerValue]

/-- Truncation toward zero of finite represented inputs; invalid inputs have
no integer truncation. A proper fraction cannot be an integral input. -/
def truncate : Number → Option Int
  | .integer n => some n
  | .negativeZero => some 0
  | .fraction f => some (if f.negative then -(f.whole : Int) else f.whole)
  | _ => none

def InInt32 (n : Int) : Prop := -2147483648 ≤ n ∧ n ≤ 2147483647
def InInt64 (n : Int) : Prop := -9223372036854775808 ≤ n ∧ n ≤ 9223372036854775807

instance (n : Int) : Decidable (InInt32 n) := by unfold InInt32; exact inferInstance
instance (n : Int) : Decidable (InInt64 n) := by unfold InInt64; exact inferInstance

/-- Closed numerical interval [-2^31, 2^31-1], including fractional values.
For a proper fraction, equality at an integral endpoint is impossible. -/
def inInt32Range : Number → Prop
  | .integer n => InInt32 n
  | .fraction f => if f.negative then f.whole < 2147483648 else f.whole < 2147483647
  | .negativeZero => True
  | _ => False

instance (x : Number) : Decidable (inInt32Range x) := by
  cases x <;> simp only [inInt32Range] <;> exact inferInstance

/-- Signed 64-bit CVTTSD2SI specification, including the invalid sentinel.
ARM64's fpToInteger must implement these same observable results. -/
def cvtt (x : Number) : Int :=
  match truncate x with
  | some n => if InInt64 n then n else -9223372036854775808
  | none => -9223372036854775808

theorem cvtt_fits (x : Number) : InInt64 (cvtt x) := by
  cases h : truncate x with
  | none => simp [cvtt, h, InInt64]
  | some n =>
    by_cases range : InInt64 n
    · simp only [cvtt, h, if_pos range]
      exact range
    · simp only [cvtt, h, if_neg range]
      decide

/-- Mathematical effect of SHL 32; SAR 32 on a signed 64-bit register. -/
def signExtend32 (n : Int) : Int := (n + 2147483648) % 4294967296 - 2147483648

theorem signExtend32_fixed (n : Int) : signExtend32 n = n ↔ InInt32 n := by
  have lo := Int.emod_nonneg (n + 2147483648) (by decide : (4294967296 : Int) ≠ 0)
  have hi := Int.emod_lt_of_pos (n + 2147483648) (by decide : (0 : Int) < 4294967296)
  unfold signExtend32 InInt32
  constructor
  · omega
  · intro h
    rw [Int.emod_eq_of_lt (by omega) (by omega)]
    omega

/-- Only this restricted binary64 encoding law is needed. In particular this
does NOT require arbitrary signed int64 values to encode exactly. -/
def ExactInt32Encoding (encode : Int → Number) : Prop :=
  ∀ n, InInt32 n → encode n = .integer n

def admission (encode : Int → Number) (x : Number) : Prop :=
  ¬ unordered (encode (cvtt x)) x ∧ equalFlag (encode (cvtt x)) x ∧
    signExtend32 (cvtt x) = cvtt x

instance (encode : Int → Number) (x : Number) : Decidable (admission encode x) := by
  unfold admission equalFlag
  exact inferInstance

theorem cvtt_integral (x : Number) (n : Int)
    (value : integerValue x = some n) (range : InInt32 n) : cvtt x = n := by
  have wide : InInt64 n := by unfold InInt32 at range; unfold InInt64; omega
  cases x <;> simp [integerValue] at value
  · cases value
    simp [cvtt, truncate, wide]
  · cases value
    decide

/-- Exact admission of int32Operand, derived from truncation, comparison and
the sign-extension check. Both zeros are admitted as integer zero. -/
theorem admission_exact (encode : Int → Number) (encoding : ExactInt32Encoding encode)
    (x : Number) :
    admission encode x ↔ ∃ n, InInt32 n ∧ integerValue x = some n := by
  constructor
  · rintro ⟨ordered, equal, fixed⟩
    have range := (signExtend32_fixed (cvtt x)).mp fixed
    have cmp := (ordered_equal _ _).mp ⟨ordered, equal⟩
    rw [encoding _ range] at cmp
    exact ⟨cvtt x, range, (integer_comparison _ _).mp cmp⟩
  · rintro ⟨n, range, value⟩
    have conversion := cvtt_integral x n value range
    have cmp : numberEq (.integer n) x := (integer_comparison n x).mpr value
    have flags := (ordered_equal (.integer n) x).mpr cmp
    unfold admission
    rw [conversion, encoding n range]
    exact ⟨flags.1, flags.2, (signExtend32_fixed n).mpr range⟩

theorem admission_finite_integral_range (encode : Int → Number)
    (encoding : ExactInt32Encoding encode) (x : Number) :
    admission encode x ↔ finite x = true ∧
      (integerValue x).isSome = true ∧ inInt32Range x := by
  rw [admission_exact encode encoding]
  cases x <;> simp [finite, integerValue, inInt32Range, InInt32]

/-- Zero divisor rejection is separate from int32 admission. -/
def remainderEligible (x y : Number) : Prop :=
  negativeZero x = false ∧ ∃ n d, integerValue x = some n ∧
    integerValue y = some d ∧ InInt32 n ∧ InInt32 d ∧ d ≠ 0

theorem remainder_eligibility (encode : Int → Number)
    (encoding : ExactInt32Encoding encode) (x y : Number) :
    remainderEligible x y ↔ negativeZero x = false ∧
      admission encode x ∧ admission encode y ∧ integerValue y ≠ some 0 := by
  constructor
  · rintro ⟨sign, n, d, vx, vy, hn, hd, nz⟩
    refine ⟨sign, (admission_exact encode encoding x).mpr ⟨n, hn, vx⟩,
      (admission_exact encode encoding y).mpr ⟨d, hd, vy⟩, ?_⟩
    rw [vy]
    exact fun h => nz (Option.some.inj h)
  · rintro ⟨sign, ax, ay, nz⟩
    obtain ⟨n, hn, vx⟩ := (admission_exact encode encoding x).mp ax
    obtain ⟨d, hd, vy⟩ := (admission_exact encode encoding y).mp ay
    refine ⟨sign, n, d, vx, vy, hn, hd, ?_⟩
    intro zero
    subst d
    exact nz vy

/-- The Number result for integral inputs, with the dividend sign observed
separately. This also specifies the early negative-zero fallback. -/
def remainderResult (negative : Bool) (n d : Int) : Number :=
  if d = 0 then .nan
  else if n.tmod d = 0 ∧ negative = true then .negativeZero
  else .integer (n.tmod d)

def integerRemainder (n d : Int) : Number := remainderResult (decide (n < 0)) n d

/-- The sign bit used after division comes from the original dividend payload,
not from integer equality (which cannot distinguish the two zeros). -/
def signBit : Number → Bool
  | .integer n => decide (n < 0)
  | .fraction f => f.negative
  | .negativeZero | .negativeInfinity => true
  | _ => false

/-- Independent integer-domain Number specification, including zero divisors
and the negative-zero dividend. None leaves general fmod outside this model. -/
def integralRemainder (x y : Number) : Option Number := do
  let n ← integerValue x
  let d ← integerValue y
  pure (remainderResult (signBit x) n d)

/-- Emitted post-IDIV reconstruction: read RDX, test integer zero, inspect the
original dividend sign, otherwise convert the integer remainder to binary64. -/
def divisionResult (encode : Int → Number) (x : Number) (n d : Int) : Number :=
  if n.tmod d = 0 ∧ signBit x = true then .negativeZero else encode (n.tmod d)

/-- Dynamic fast path, with None representing the emitted slow-path jump. -/
def dynamicFastPath (encode : Int → Number) (x y : Number) : Option Number :=
  if negativeZero x then none
  else if admission encode x then
    if admission encode y then
      if cvtt y = 0 then none
      else some (divisionResult encode x (cvtt x) (cvtt y))
    else none
  else none

theorem remainder_decomposition (n d : Int) :
    n.tmod d + d * n.tdiv d = n := Int.tmod_add_tdiv n d

theorem remainder_bounds (n d : Int) (nonzero : d ≠ 0) :
    (0 ≤ n → 0 ≤ n.tmod d ∧ n.tmod d < (d.natAbs : Int)) ∧
    (n ≤ 0 → -(d.natAbs : Int) < n.tmod d ∧ n.tmod d ≤ 0) := by
  constructor
  · intro hn
    exact ((Int.tdiv_tmod_unique hn nonzero).mp ⟨rfl, rfl⟩).2
  · intro hn
    exact ((Int.tdiv_tmod_unique' hn nonzero).mp ⟨rfl, rfl⟩).2

theorem int32_natAbs (n : Int) (range : InInt32 n) : n.natAbs ≤ 2147483648 := by
  unfold InInt32 at range
  by_cases h : 0 ≤ n
  · have := Int.natAbs_of_nonneg h
    omega
  · have := Int.ofNat_natAbs_of_nonpos (by omega : n ≤ 0)
    omega

/-- The quotient can need 33 signed bits; neither quotient nor remainder
overflows the 64-bit path. The remainder is exactly encodable in binary64. -/
theorem division_fits (n d : Int) (hn : InInt32 n) (hd : InInt32 d) (nz : d ≠ 0) :
    InInt64 (n.tdiv d) ∧ InInt32 (n.tmod d) := by
  have nq := Int.natAbs_tdiv_le_natAbs n d
  have nb := int32_natAbs n hn
  have db := int32_natAbs d hd
  have qhi := Int.le_natAbs (a := n.tdiv d)
  have qlo := Int.le_natAbs (a := -(n.tdiv d))
  simp only [Int.natAbs_neg] at qlo
  have bounds := remainder_bounds n d nz
  unfold InInt64 InInt32
  constructor
  · omega
  · by_cases sign : 0 ≤ n
    · have := bounds.1 sign; omega
    · have := bounds.2 (by omega); omega

theorem division_result_correct (encode : Int → Number) (encoding : ExactInt32Encoding encode)
    (x : Number) (n d : Int) (hn : InInt32 n) (hd : InInt32 d) (nz : d ≠ 0) :
    divisionResult encode x n d = remainderResult (signBit x) n d := by
  have exactRemainder := encoding _ (division_fits n d hn hd nz).2
  simp [divisionResult, remainderResult, nz, exactRemainder]

/-- Composition of the guards, conversion laws, 64-bit division bound and sign
reconstruction. The specification still handles early -0 and zero divisors;
the emitted fast path is justified only when its separate guards hold. -/
theorem dynamic_fast_path_correct (encode : Int → Number) (encoding : ExactInt32Encoding encode)
    (x y : Number) (eligible : remainderEligible x y) :
    dynamicFastPath encode x y = integralRemainder x y := by
  obtain ⟨sign, n, d, vx, vy, hn, hd, nz⟩ := eligible
  have ax := (admission_exact encode encoding x).mpr ⟨n, hn, vx⟩
  have ay := (admission_exact encode encoding y).mpr ⟨d, hd, vy⟩
  have cx := cvtt_integral x n vx hn
  have cy := cvtt_integral y d vy hd
  simp [dynamicFastPath, sign, ax, ay, cx, cy, nz, integralRemainder, vx, vy,
    division_result_correct encode encoding x n d hn hd nz]

theorem remainder_zero_sign (negative : Bool) (n d : Int) (nz : d ≠ 0) :
    negativeZero (remainderResult negative n d) = true ↔
      n.tmod d = 0 ∧ negative = true := by
  simp only [remainderResult, if_neg nz]
  split <;> simp_all [negativeZero]

theorem integer_remainder_zero_sign (n d : Int) (nz : d ≠ 0) :
    negativeZero (integerRemainder n d) = true ↔ n.tmod d = 0 ∧ n < 0 := by
  simpa [integerRemainder] using remainder_zero_sign (decide (n < 0)) n d nz

private theorem highBit {d k : Nat} (lo : 2 ^ k ≤ d) (hi : d < 2 ^ (k + 1)) :
    d.testBit k = true := by
  have bound : d - 2 ^ k < 2 ^ k := by
    rw [Nat.pow_succ] at hi
    omega
  have split : d = 2 ^ k + (d - 2 ^ k) := by omega
  conv => lhs; rw [split]
  rw [Nat.testBit_two_pow_add_eq, Nat.testBit_lt_two_pow bound]
  rfl

/-- Adapted from the coordinator's pinned 4.19.0 proof for #659. -/
theorem maskable_iff (d : Nat) :
    (1 ≤ d ∧ d ≤ 2 ^ 30 ∧ (d &&& (d - 1)) = 0) ↔
      ∃ k : Nat, k ≤ 30 ∧ d = 2 ^ k := by
  constructor
  · rintro ⟨pos, bound, cleared⟩
    have nz : d ≠ 0 := by omega
    have lo := Nat.log2_self_le nz
    have hi := Nat.lt_log2_self (n := d)
    have isPower : d = 2 ^ d.log2 := by
      apply Classical.byContradiction
      intro unequal
      have first := highBit lo hi
      have next := highBit (d := d - 1) (k := d.log2) (by omega) (by omega)
      have common := congrArg (fun word : Nat => word.testBit d.log2) cleared
      simp [Nat.testBit_and, first, next] at common
    refine ⟨d.log2, ?_, isPower⟩
    apply Classical.byContradiction
    intro tooHigh
    have high : 31 ≤ d.log2 := by omega
    have over := (Nat.le_log2 nz).mp high
    omega
  · rintro ⟨k, limit, rfl⟩
    refine ⟨Nat.two_pow_pos k, ?_, ?_⟩
    · exact Nat.pow_le_pow_right (by decide) limit
    · rw [Nat.and_two_pow_sub_one_eq_mod, Nat.mod_self]

/-- On the positive guarded domain, JS ToInt32 is signExtend32 and its
bitwise AND is the AND of these nonnegative integer words. -/
def jsBitPredicate (d : Nat) : Prop :=
  ((signExtend32 (d : Int)).toNat &&&
    (signExtend32 ((d - 1 : Nat) : Int)).toNat) = 0

instance (d : Nat) : Decidable (jsBitPredicate d) := by
  unfold jsBitPredicate
  exact inferInstance

theorem guarded_toInt32 (d : Nat) (pos : 1 ≤ d) (bound : d ≤ 2 ^ 30) :
    signExtend32 (d : Int) = d ∧
    signExtend32 ((d - 1 : Nat) : Int) = (d - 1 : Nat) := by
  constructor <;> apply (signExtend32_fixed _).mpr <;> unfold InInt32 <;> omega

def staticGuard (d : Nat) : Prop := 1 ≤ d ∧ d ≤ 2 ^ 30 ∧ jsBitPredicate d

instance (d : Nat) : Decidable (staticGuard d) := by
  unfold staticGuard
  exact inferInstance

/-- The complete production literal guard, including bounded JS bit coercion,
admits exactly 1, 2, ..., 2^30 that are powers of two. -/
theorem static_guard_exact (d : Nat) :
    staticGuard d ↔ ∃ k : Nat, k ≤ 30 ∧ d = 2 ^ k := by
  have bridge (pos : 1 ≤ d) (bound : d ≤ 2 ^ 30) :
      jsBitPredicate d ↔ (d &&& (d - 1)) = 0 := by
    obtain ⟨hd, hp⟩ := guarded_toInt32 d pos bound
    simp [jsBitPredicate, hd, hp]
  constructor
  · rintro ⟨pos, bound, bit⟩
    exact (maskable_iff d).mp ⟨pos, bound, (bridge pos bound).mp bit⟩
  · intro h
    obtain ⟨pos, bound, bit⟩ := (maskable_iff d).mpr h
    exact ⟨pos, bound, (bridge pos bound).mpr bit⟩

/-- Number.isInteger and the positive bounds first place the Number literal
in this natural-number domain. Non-Number operands are excluded by the caller. -/
def numberStaticGuard (x : Number) : Prop :=
  ∃ d : Nat, integerValue x = some (d : Int) ∧ staticGuard d

theorem number_static_guard_exact (x : Number) :
    numberStaticGuard x ↔
      ∃ k : Nat, k ≤ 30 ∧ integerValue x = some ((2 ^ k : Nat) : Int) := by
  constructor
  · rintro ⟨d, value, guard⟩
    obtain ⟨k, bound, rfl⟩ := (static_guard_exact d).mp guard
    exact ⟨k, bound, value⟩
  · rintro ⟨k, bound, value⟩
    exact ⟨2 ^ k, value, (static_guard_exact _).mpr ⟨k, bound, rfl⟩⟩

/-- Mathematical mask identity has no 2^30 upper bound. Nonnegativity is
essential for truncating remainder, independently of static eligibility. -/
theorem nonnegative_mask (n k : Nat) :
    ((n &&& (2 ^ k - 1) : Nat) : Int) = (n : Int).tmod (2 ^ k : Nat) := by
  rw [Nat.and_two_pow_sub_one_eq_mod]
  rfl

/-- Composition of the production bit predicate with the remainder theorem. -/
theorem static_mask_remainder (n d : Nat) (guard : staticGuard d) :
    ((n &&& (d - 1) : Nat) : Int) = (n : Int).tmod (d : Int) := by
  obtain ⟨k, _, rfl⟩ := (static_guard_exact d).mp guard
  exact nonnegative_mask n k

theorem static_mask_number (n d : Nat) (guard : staticGuard d) :
    integerRemainder (n : Int) (d : Int) = .integer ((n &&& (d - 1) : Nat) : Int) := by
  have nz : (d : Int) ≠ 0 := by have := guard.1; omega
  have sign : ¬ (n : Int) < 0 := by omega
  simp [integerRemainder, remainderResult, nz, sign, static_mask_remainder n d guard]

/-- The static branch uses masking only for nonnegative int32 dividends;
negative dividends retain division and its zero-sign reconstruction. -/
def staticResult (encode : Int → Number) (n : Int) (d : Nat) : Number :=
  if n < 0 then divisionResult encode (.integer n) n (d : Int)
  else encode ((n.toNat &&& (d - 1) : Nat) : Int)

theorem static_fast_path_correct (encode : Int → Number) (encoding : ExactInt32Encoding encode)
    (n : Int) (d : Nat) (hn : InInt32 n) (guard : staticGuard d) :
    staticResult encode n d = integerRemainder n (d : Int) := by
  have nz : (d : Int) ≠ 0 := by have := guard.1; omega
  have hd : InInt32 (d : Int) := by
    have := guard.2.1
    unfold InInt32
    omega
  by_cases negative : n < 0
  · simpa [staticResult, negative, integerRemainder, signBit] using
      division_result_correct encode encoding (.integer n) n (d : Int) hn hd nz
  · have natural : (n.toNat : Int) = n := by omega
    have mask := static_mask_remainder n.toNat d guard
    rw [natural] at mask
    have fits := (division_fits n (d : Int) hn hd nz).2
    simp [staticResult, negative, mask, encoding _ fits,
      integerRemainder, remainderResult, nz]

-- Kernel-checked witnesses and guard counterexamples; never native_decide.
def oneAndHalf : Fraction := ⟨false, 1, 1, 0, by decide, by decide, by decide⟩
def twoAndHalf : Fraction := ⟨false, 2, 1, 0, by decide, by decide, by decide⟩
def aboveInt32 : Fraction := ⟨false, 2147483647, 1, 0, by decide, by decide, by decide⟩
def belowInt32 : Fraction := ⟨true, 2147483648, 1, 0, by decide, by decide, by decide⟩
example : finite (.fraction oneAndHalf) = true ∧ inInt32Range (.fraction oneAndHalf) ∧
    integerValue (.fraction oneAndHalf) = none := by decide
example : ¬ inInt32Range (.fraction aboveInt32) ∧
    ¬ inInt32Range (.fraction belowInt32) := by decide
example : numberEq (.fraction oneAndHalf) (.fraction oneAndHalf) := by decide
example : ¬ numberEq (.fraction oneAndHalf) (.fraction twoAndHalf) := by decide
example : truncate (.fraction oneAndHalf) = some 1 ∧
    ¬ numberEq (.integer 1) (.fraction oneAndHalf) := by decide
example : equalFlag (.integer 0) .nan ∧ ¬ numberEq (.integer 0) .nan := by decide
example : numberEq (.integer 0) .negativeZero ∧
    negativeZero (.integer 0) ≠ negativeZero .negativeZero := by decide
example : admission Number.integer (.integer 0) ∧
    admission Number.integer .negativeZero := by decide
example : ¬ admission Number.integer (.fraction oneAndHalf) ∧
    ¬ admission Number.integer .nan ∧
    ¬ admission Number.integer .positiveInfinity ∧
    ¬ admission Number.integer .negativeInfinity := by decide
example : cvtt .nan = -9223372036854775808 ∧
    cvtt .positiveInfinity = -9223372036854775808 ∧
    cvtt .negativeInfinity = -9223372036854775808 := by decide
example : InInt32 (-2147483648) ∧ InInt32 2147483647 ∧
    ¬ InInt32 (-2147483649) ∧ ¬ InInt32 2147483648 := by decide
example : admission Number.integer (.integer (-2147483648)) ∧
    admission Number.integer (.integer 2147483647) ∧
    ¬ admission Number.integer (.integer (-2147483649)) ∧
    ¬ admission Number.integer (.integer 2147483648) := by decide
example : cvtt (.integer 2147483648) = 2147483648 ∧
    numberEq (.integer (cvtt (.integer 2147483648))) (.integer 2147483648) ∧
    signExtend32 2147483648 ≠ 2147483648 := by decide
example : cvtt (.integer (-2147483649)) = -2147483649 ∧
    signExtend32 (-2147483649) ≠ -2147483649 := by decide
example : cvtt (.integer (-9223372036854775808)) = -9223372036854775808 ∧
    ¬ InInt32 (-9223372036854775808) := by decide
example : cvtt (.integer 9223372036854775808) = -9223372036854775808 ∧
    cvtt (.integer (-9223372036854777856)) = -9223372036854775808 := by decide
example : (-2147483648 : Int).tdiv (-1) = 2147483648 ∧
    integerRemainder (-2147483648) (-1) = .negativeZero := by decide
example : (-7 : Int).tmod 3 = -1 ∧ (-7 : Int) % 3 = 2 := by decide
example : (7 : Int).tmod 0 = 7 ∧ integerRemainder 7 0 = .nan := by decide
example : integerRemainder (-8) 2 = .negativeZero := by decide
example : remainderResult true 0 2 = .negativeZero ∧
    integerRemainder 0 2 = .integer 0 := by decide
example : integralRemainder .negativeZero (.integer 2) = some .negativeZero ∧
    dynamicFastPath Number.integer .negativeZero (.integer 2) = none := by decide
example : dynamicFastPath Number.integer (.integer 7) .negativeZero = none := by decide
example : (0 &&& (0 - 1) : Nat) = 0 ∧ ¬ staticGuard 0 := by decide
example : (6 &&& 5 : Nat) = 4 ∧ (6 : Int).tmod 6 = 0 ∧ ¬ staticGuard 6 := by decide
example : staticGuard 1 ∧ staticGuard 2 ∧ staticGuard (2 ^ 30) := by decide
example : ¬ staticGuard (2 ^ 30 + 1) ∧ ¬ staticGuard (2 ^ 31) := by decide
-- Interpret a negative dividend as its two's-complement low word before AND.
example : (((-7 : Int) % 4294967296).toNat &&& 7) = 1 ∧
    (-7 : Int).tmod 8 = -7 := by decide
example : (((-8 : Int) % 4294967296).toNat &&& 7) = 0 ∧
    integerRemainder (-8) 8 = .negativeZero := by decide

end Nona.Numeric
