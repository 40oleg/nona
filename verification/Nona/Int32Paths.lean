/-
Int32 fast paths of the code generator (src/backend/x64/integer-ops.ts,
src/backend/x64/switch-table.ts, src/ir/lower/control.ts).

The generated code tests whether a Number holds an int32 by converting it
to a 64-bit integer (`cvttsd2si`, FCVTZS on ARM64), converting back
(`cvtsi2sd`) and comparing with `ucomisd`. This file models those three
instructions on an abstraction of binary64 values and proves, against the
ECMA-262 definitions:

* `int32Operand` accepts exactly the int32 values (and -0, which compares
  equal to +0), on both the x86-64 and the ARM64 conversion semantics;
* the inline `%` returns `Number::remainder`; a -0 dividend must be sent to
  the runtime before the mask path (`mask_needs_negZero_guard`), but not
  before the divide path, which reads the sign of a zero remainder from the
  dividend's bits;
* the masked `%` by a constant 2^k agrees with the division for
  non-negative dividends;
* the jump-table dispatch of a dense `switch` selects the same case as the
  chain of strict equalities, for every value.
-/
namespace Nona.Int32Paths

/-! ## Numbers -/

/-- A binary64 value, abstracted to what the fast paths can distinguish.
`int z` is a finite double whose value is the integer `z` (`int 0` is +0);
`frac` is a finite double that is not an integer. -/
inductive Num where
  | nan
  | posInf
  | negInf
  | negZero
  | int (z : Int)
  | frac
  deriving DecidableEq, Repr

/-- `ucomisd` equality (ZF set, PF clear): IEEE equality, -0 = +0. -/
def numEq : Num → Num → Bool
  | .int a, .int b => a == b
  | .negZero, .int 0 => true
  | .int 0, .negZero => true
  | .negZero, .negZero => true
  | .posInf, .posInf => true
  | .negInf, .negInf => true
  | _, _ => false

/-- The machine's double-to-integer conversion, a parameter: `cvttsd2si` on
x86-64 returns the indefinite value -2^63 out of range, FCVTZS on ARM64
saturates. Both truncate in range, which is all the proofs assume. -/
structure Machine where
  toInt : Num → Int
  /-- `cvtsi2sd`: an integer as the nearest double. -/
  ofInt : Int → Num
  toInt_int : ∀ z, -2 ^ 63 ≤ z → z < 2 ^ 63 → toInt (.int z) = z
  toInt_negZero : toInt .negZero = 0
  ofInt_exact : ∀ r, -2 ^ 53 ≤ r → r ≤ 2 ^ 53 → ofInt r = .int r
  /-- A conversion result is a 64-bit integer. -/
  toInt_range : ∀ x, -2 ^ 63 ≤ toInt x ∧ toInt x < 2 ^ 63
  /-- Rounding to the nearest double keeps every result finite and integral. -/
  ofInt_int : ∀ r, ∃ z, ofInt r = .int z

/-- The round trip both fast paths start with: `cvttsd2si`, `cvtsi2sd`,
`ucomisd` (jumping away on parity or inequality). -/
def roundTrips (m : Machine) (x : Num) : Bool := numEq (m.ofInt (m.toInt x)) x

/-- `int32Operand`: the round trip, then `shl 32; sar 32` must give back the
same register (the value fits in 32 bits). -/
def int32Operand (m : Machine) (x : Num) : Option Int :=
  if roundTrips m x ∧ -2 ^ 31 ≤ m.toInt x ∧ m.toInt x < 2 ^ 31 then
    some (m.toInt x)
  else none

theorem numEq_int_left {a : Int} {x : Num} (h : numEq (.int a) x = true) :
    x = .int a ∨ (a = 0 ∧ x = .negZero) := by
  cases x with
  | int b =>
    left
    have : a = b := by simpa [numEq] using h
    rw [this]
  | negZero =>
    right
    refine ⟨?_, rfl⟩
    match a, h with
    | 0, _ => rfl
  | _ => simp [numEq] at h

/-- `int32Operand` accepts an int32 value with its value, and -0 as 0;
nothing else. -/
theorem int32Operand_sound (m : Machine) (x : Num) (r : Int)
    (h : int32Operand m x = some r) :
    -2 ^ 31 ≤ r ∧ r < 2 ^ 31 ∧ (x = .int r ∨ (r = 0 ∧ x = .negZero)) := by
  unfold int32Operand roundTrips at h
  split at h
  · rename_i hc
    simp at h; subst h
    obtain ⟨hrt, hlo, hhi⟩ := hc
    refine ⟨hlo, hhi, ?_⟩
    rw [m.ofInt_exact _ (by omega) (by omega)] at hrt
    exact numEq_int_left hrt
  · simp at h

theorem int32Operand_complete (m : Machine) (z : Int)
    (hlo : -2 ^ 31 ≤ z) (hhi : z < 2 ^ 31) :
    int32Operand m (.int z) = some z := by
  have hz : m.toInt (.int z) = z := m.toInt_int z (by omega) (by omega)
  unfold int32Operand roundTrips
  rw [hz, m.ofInt_exact z (by omega) (by omega)]
  simp only [numEq, beq_self_eq_true, true_and, decide_eq_true_eq]
  exact if_pos ⟨hlo, hhi⟩

/-! ## `%` -/

/-- ECMA-262 Number::remainder (6.1.6.1.6) on the values of `Num`: NaN or an
infinite dividend or a zero divisor give NaN, an infinite divisor gives the
dividend, a zero dividend gives itself, otherwise r = n - d × q with q the
quotient truncated towards zero, and a zero r takes the sign of n. The
remainder of a fraction is not modeled (`frac`): the fast path never
returns for one. -/
def remainderSpec : Num → Num → Num
  | .int a, .int b =>
      if b = 0 then .nan
      else if a.tmod b = 0 ∧ a < 0 then .negZero
      else .int (a.tmod b)
  | .negZero, .int b => if b = 0 then .nan else .negZero
  | .negZero, .negZero | .int _, .negZero => .nan
  | .nan, _ | .posInf, _ | .negInf, _ => .nan
  | _, .nan => .nan
  | n, .posInf | n, .negInf => n
  | _, _ => .frac

/-- The sign test of a zero remainder: `integerRemainder` reloads the
dividend's bits and tests their sign (`test rax, rax; js`), so -0 counts
as negative. Only values `int32Operand` accepts matter here. -/
def signBit : Num → Bool
  | .negZero => true
  | .int z => decide (z < 0)
  | _ => false

/-- `idiv` (truncating, on 64 bits) and the sign of a zero remainder. -/
def divideResult (n : Num) (a b : Int) : Num :=
  if a.tmod b ≠ 0 then .int (a.tmod b)
  else if signBit n then .negZero
  else .int 0

/-- The divisor of `integerRemainder`: a register, or a constant 2^k that
`maskableDivisor` admits (1 ≤ 2^k ≤ 2^30). -/
inductive Divisor where
  | reg (d : Num)
  | pow (k : Nat)

def Divisor.num : Divisor → Num
  | .reg d => d
  | .pow k => .int (2 ^ k)

/-- What `integerRemainder` (src/backend/x64/integer-ops.ts) computes when it
does not jump to `rt.rem` (`none`). `guardDivide` and `guardMask` say
whether a -0 dividend is sent to the runtime before the divide path and
before the mask path; the code as written guards both. -/
def integerRemainder (guardDivide guardMask : Bool) (m : Machine) (n : Num) :
    Divisor → Option Num
  | .reg d =>
      if guardDivide ∧ n = .negZero then none
      else
        match int32Operand m n, int32Operand m d with
        | some a, some b => if b = 0 then none else some (divideResult n a b)
        | _, _ => none
  | .pow k =>
      if guardMask ∧ n = .negZero then none
      else
        match int32Operand m n with
        | some a =>
            if 0 ≤ a then some (.int (Int.ofNat (a.toNat &&& (2 ^ k - 1))))
            else some (divideResult n a (2 ^ k))
        | none => none

/-- The mask path: for a constant divisor 2^k and a non-negative dividend,
`and r10, 2^k - 1` is the remainder. -/
theorem mask_is_remainder (n k : Nat) :
    Int.ofNat (n &&& (2 ^ k - 1)) = (Int.ofNat n).tmod ((2 : Int) ^ k) := by
  rw [Nat.and_two_pow_sub_one_eq_mod]
  have h : ((2 : Int) ^ k) = Int.ofNat (2 ^ k) := (Int.natCast_pow 2 k).symm
  rw [h]
  rfl

/-- The divide path is right for every dividend the round trip accepts,
-0 included: the sign test of a zero remainder reads the sign bit. -/
theorem divideResult_correct (m : Machine) (n d : Num) (a b : Int)
    (ha : int32Operand m n = some a) (hb : int32Operand m d = some b)
    (hb0 : b ≠ 0) : divideResult n a b = remainderSpec n d := by
  obtain ⟨-, -, hx⟩ := int32Operand_sound m n a ha
  obtain ⟨-, -, hy⟩ := int32Operand_sound m d b hb
  have hd : d = .int b := by
    rcases hy with hy | ⟨hb0', -⟩
    · exact hy
    · exact absurd hb0' hb0
  subst hd
  rcases hx with hx | ⟨ha0, hx⟩
  · subst hx
    by_cases hr : a.tmod b = 0
    · by_cases hneg : a < 0
      · simp [divideResult, signBit, remainderSpec, hb0, hr, hneg]
      · simp [divideResult, signBit, remainderSpec, hb0, hr, hneg]
    · simp [divideResult, remainderSpec, hb0, hr]
  · subst hx; subst ha0
    simp [divideResult, signBit, remainderSpec, hb0]

/-- `integerRemainder` returns Number::remainder whenever it does not call
the runtime, as long as the mask path is guarded against -0. The guard of
the divide path is not needed (`guardDivide` is arbitrary). -/
theorem integerRemainder_correct (guardDivide : Bool) (m : Machine) (n : Num)
    (d : Divisor) (v : Num) (h : integerRemainder guardDivide true m n d = some v) :
    v = remainderSpec n d.num := by
  cases d with
  | reg d =>
    simp only [integerRemainder] at h
    split at h
    · simp at h
    · split at h
      · rename_i a b ha hb
        by_cases hb0 : b = 0
        · simp [hb0] at h
        · simp only [hb0, if_false, Option.some.injEq] at h
          subst h
          exact divideResult_correct m n d a b ha hb hb0
      · simp at h
  | pow k =>
    simp only [integerRemainder] at h
    split at h
    · simp at h
    · rename_i hguard
      have hn : n ≠ .negZero := by
        intro hn; exact hguard ⟨trivial, hn⟩
      split at h
      · rename_i a ha
        obtain ⟨-, -, hx⟩ := int32Operand_sound m n a ha
        have hx' : n = .int a := by
          rcases hx with hx | ⟨-, hx⟩
          · exact hx
          · exact absurd hx hn
        subst hx'
        have hpos : (2 : Int) ^ k ≠ 0 := Int.ne_of_gt (Int.pow_pos (by decide))
        by_cases h0 : 0 ≤ a
        · simp only [h0, if_true, Option.some.injEq] at h
          subst h
          have hm := mask_is_remainder a.toNat k
          have hofn : Int.ofNat a.toNat = a := Int.toNat_of_nonneg h0
          rw [hofn] at hm
          have hnn : ¬ a < 0 := by omega
          rw [hm]
          simp [Divisor.num, remainderSpec, hpos, hnn]
        · simp only [h0, if_false, Option.some.injEq] at h
          subst h
          by_cases hr : a.tmod ((2 : Int) ^ k) = 0
          · simp [divideResult, signBit, Divisor.num, remainderSpec, hpos, hr]
          · simp [divideResult, Divisor.num, remainderSpec, hpos, hr]
      · simp at h

/-- Without its -0 test the mask path would be wrong: -0 % 4 is -0, but the
round trip accepts -0 as the int32 0, the dividend is not negative, and
`and` gives +0. -/
theorem mask_needs_negZero_guard (m : Machine) :
    integerRemainder true false m .negZero (.pow 2) = some (.int 0) ∧
      remainderSpec .negZero (Divisor.pow 2).num = .negZero := by
  have h0 : int32Operand m .negZero = some 0 := by
    unfold int32Operand roundTrips
    rw [m.toInt_negZero, m.ofInt_exact 0 (by omega) (by omega)]
    simp [numEq]
  simp [integerRemainder, h0, Divisor.num, remainderSpec]

/-! ## Jump tables of dense `switch` statements -/

/-- A JavaScript value as far as `===` against a literal is concerned. -/
inductive Val where
  | num (x : Num)
  | str (s : String)
  | big (b : Int)
  | other (id : Nat)
  deriving DecidableEq

/-- IsStrictlyEqual (7.2.15) between the discriminant and a case literal. -/
def strictEq : Val → Val → Bool
  | .num x, .num y => numEq x y
  | .str a, .str b => a == b
  | .big a, .big b => a == b
  | .other a, .other b => a == b
  | _, _ => false

/-- The case clauses of a `switch` whose tests are all literals (`none` is
`default`), as `switchTable` requires. -/
abbrev Cases := List (Option Val)

/-- The first clause index satisfying `p`, if any. -/
def firstIndex (p : Option Val → Bool) : List (Option Val) → Option Nat
  | [] => none
  | c :: rest => if p c then some 0 else (firstIndex p rest).map (· + 1)

def defaultIndex (cases : Cases) : Option Nat := firstIndex (· = none) cases

/-- The compare chain (CaseBlockEvaluation): the first clause whose test is
strictly equal to the discriminant, else `default`; `none` leaves the switch. -/
def chain (cases : Cases) (v : Val) : Option Nat :=
  match firstIndex (fun c => match c with | some t => strictEq v t | none => false) cases with
  | some i => some i
  | none => defaultIndex cases

/-- The table key of a literal (`switchTable` in src/ir/lower/control.ts):
an integral Number with |value| < 2^31, -0 as 0. -/
def keyOf : Option Val → Option Int
  | some (.num (.int z)) => if -2 ^ 31 < z ∧ z < 2 ^ 31 then some z else none
  | some (.num .negZero) => some 0
  | _ => none

/-- Table entry for the integer `z`: the first clause with that key, else
`default` (or leaving the switch). -/
def entry (cases : Cases) (z : Int) : Option Nat :=
  match firstIndex (fun c => keyOf c == some z) cases with
  | some i => some i
  | none => defaultIndex cases

/-- The emitted dispatch (src/backend/x64/switch-table.ts): tag test, round
trip, `sub rax, low`, an unsigned compare with the table length on 64-bit
registers, then the indirect jump; anything else takes the chain. -/
def dispatch (m : Machine) (cases : Cases) (low : Int) (len : Nat) (v : Val) :
    Option Nat :=
  match v with
  | .num x =>
      if roundTrips m x then
        let d : Int := (m.toInt x - low) % (2 ^ 64 : Int)
        if d < (len : Int) then entry cases (low + d) else chain cases v
      else chain cases v
  | _ => chain cases v

theorem strictEq_num_int (z : Int) (t : Option Val) (hz : -2 ^ 31 < z ∧ z < 2 ^ 31) :
    (match t with | some t => strictEq (.num (.int z)) t | none => false) =
      (keyOf t == some z) := by
  rcases t with _ | t
  · simp [keyOf]
  · cases t with
    | num y =>
      cases y with
      | int w =>
        simp only [strictEq, numEq, keyOf]
        by_cases hzw : z = w
        · subst hzw
          have h1 : -2 ^ 31 < z := hz.1
          have h2 : z < 2 ^ 31 := hz.2
          simp
          exact ⟨by omega, by omega⟩
        · have : (z == w) = false := by simpa using hzw
          rw [this]
          by_cases hw : -2 ^ 31 < w ∧ w < 2 ^ 31
          · simp [hw]; omega
          · simp [hw]
            intro h1 h2 h3
            exact hw ⟨by omega, by omega⟩
      | negZero =>
        simp only [strictEq, keyOf]
        by_cases h0 : z = 0
        · subst h0; rfl
        · have : numEq (.int z) .negZero = false := by
            cases z with
            | ofNat n =>
              cases n with
              | zero => exact absurd rfl h0
              | succ n => rfl
            | negSucc n => rfl
          rw [this]
          simp; omega
      | _ => simp [strictEq, numEq, keyOf]
    | _ => simp [strictEq, keyOf]

theorem firstIndex_congr {p q : Option Val → Bool} (cases : Cases)
    (h : ∀ c, p c = q c) : firstIndex p cases = firstIndex q cases := by
  induction cases with
  | nil => rfl
  | cons c rest ih => simp [firstIndex, h c, ih]

/-- The jump table selects the same clause as the chain of `===`, for every
discriminant, whatever the conversion semantics of the machine, as long as
the table's range is int32-sized. -/
theorem dispatch_eq_chain (m : Machine) (cases : Cases) (low : Int) (len : Nat)
    (hlow : -2 ^ 31 < low) (hlen : low + len ≤ 2 ^ 31) (v : Val) :
    dispatch m cases low len v = chain cases v := by
  cases v with
  | num x =>
    simp only [dispatch]
    split
    · rename_i hrt
      have hr := m.toInt_range x
      split
      · rename_i hd
        -- The 64-bit subtraction did not wrap: the register holds low + d.
        have hreg : m.toInt x = low + (m.toInt x - low) % 2 ^ 64 := by omega
        have hsmall : -2 ^ 31 < m.toInt x ∧ m.toInt x < 2 ^ 31 := by omega
        unfold roundTrips at hrt
        rw [m.ofInt_exact _ (by omega) (by omega)] at hrt
        rw [← hreg]
        unfold entry chain
        generalize hz : m.toInt x = z at *
        rcases numEq_int_left hrt with hx | ⟨h0, hx⟩
        · subst hx
          rw [firstIndex_congr cases (fun c => strictEq_num_int z c hsmall)]
        · subst hx; subst h0
          have : (fun c : Option Val => match c with | some t => strictEq (.num .negZero) t | none => false)
              = (fun c => keyOf c == some 0) := by
            funext c
            rcases c with _ | t
            · simp [keyOf]
            · cases t with
              | num y =>
                cases y with
                | int w =>
                  simp only [strictEq, keyOf]
                  by_cases hw0 : w = 0
                  · subst hw0; rfl
                  · have : numEq .negZero (.int w) = false := by
                      cases w with
                      | ofNat n =>
                        cases n with
                        | zero => exact absurd rfl hw0
                        | succ n => rfl
                      | negSucc n => rfl
                    rw [this]
                    by_cases hw : -2 ^ 31 < w ∧ w < 2 ^ 31
                    · simp [hw]; omega
                    · simp [hw]
                      intro _ _ h
                      exact hw0 h
                | _ => simp [strictEq, numEq, keyOf]
              | _ => simp [strictEq, keyOf]
          rw [this]
      · rfl
    · rfl
  | _ => rfl

end Nona.Int32Paths
