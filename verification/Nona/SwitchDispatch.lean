import Nona.SwitchEquality
import Nona.SwitchIndex

namespace Nona.Switch

open Numeric

/-- Signed literals carry the evaluated result of unary plus/minus on a Number
literal. Dynamic tests are not eligible even when their result is a Number.
The AST-to-value interpretation is a production correspondence obligation. -/
inductive Label where
  | literal (value : Value)
  | signed (value : Number)
  | dynamic (value : Value)
  deriving DecidableEq

def Label.value : Label → Value
  | .literal v | .dynamic v => v
  | .signed n => .number n

def Label.supported : Label → Bool
  | .dynamic _ => false
  | _ => true

structure Clause where
  test : Option Label
  target : Nat
  deriving DecidableEq

def allLiteral (cs : List Clause) : Prop :=
  cs.all (fun c => c.test.all Label.supported) = true

instance (cs : List Clause) : Decidable (allLiteral cs) := by
  unfold allLiteral
  infer_instance

/-- Math.abs(value) < 2**31 excludes BOTH signed endpoints ±2**31.
integerValue normalizes -0. Fractions and other literal types add no key. -/
def keyRange (n : Int) : Prop := -2147483648 < n ∧ n < 2147483648

instance (n : Int) : Decidable (keyRange n) := by unfold keyRange; infer_instance

def valueKey : Value → Option Int
  | .number n => (integerValue n).filter (fun k => decide (keyRange k))
  | _ => none

def clauseKey (c : Clause) : Option Int := do
  let l ← c.test
  if l.supported then valueKey l.value else none

theorem key_bounded (c : Clause) (n : Int) (h : clauseKey c = some n) : keyRange n := by
  rcases c with ⟨test, target⟩
  cases test with
  | none => simp [clauseKey] at h
  | some l =>
    cases l <;> simp [clauseKey, Label.supported, Label.value] at h
    case literal v =>
      cases v <;> simp [valueKey] at h
      case number x =>
        cases x <;> simp [valueKey, integerValue, Option.filter] at h
        all_goals exact h.2
    case signed x =>
      cases x <;> simp [valueKey, integerValue, Option.filter] at h
      all_goals obtain ⟨hr, rfl⟩ := h; exact hr

def search (eq : Value → Value → Prop) [DecidableRel eq]
    (x : Value) : List Clause → Option Nat
  | [] => none
  | c :: cs => match c.test with
      | none => search eq x cs
      | some l => if eq x l.value then some c.target else search eq x cs

def defaultTarget (cs : List Clause) (endTarget : Nat) : Nat :=
  ((cs.find? (fun c => c.test.isNone)).map Clause.target).getD endTarget

def linear (cs : List Clause) (x : Value) (endTarget : Nat) : Nat :=
  (search strictEq x cs).getD (defaultTarget cs endTarget)

def chain (cs : List Clause) (x : Value) (endTarget : Nat) : Nat :=
  (search chainEq x cs).getD (defaultTarget cs endTarget)

theorem search_correct (cs : List Clause) (x : Value) :
    search chainEq x cs = search strictEq x cs := by
  induction cs with
  | nil => rfl
  | cons c cs ih =>
    cases h : c.test <;> simp [search, h, strict_equality_correct, ih]

theorem all_chain_correct (cs : List Clause) (x : Value) (endTarget : Nat) :
    chain cs x endTarget = linear cs x endTarget := by
  simp [chain, linear, search_correct]

/-- Functional first-occurrence Map lookup; retaining the head on duplicates
is the effect of `if (!first.has(key)) first.set(key,index)`. -/
def firstKey (cs : List Clause) (n : Int) : Option Nat :=
  match cs with
  | [] => none
  | c :: rest => if clauseKey c = some n then some c.target else firstKey rest n

theorem key_matches (l : Label) (supported : l.supported = true)
    (n : Int) (range : keyRange n) :
    (clauseKey ⟨some l, 0⟩ = some n) ↔ strictEq (.number (.integer n)) l.value := by
  cases l with
  | dynamic v => simp [Label.supported] at supported
  | literal v =>
    cases v <;> simp [clauseKey, Label.supported, Label.value, valueKey, strictEq]
    case number x =>
      cases x <;> simp [integerValue, Option.filter, mathematicalNumberEq, range, eq_comm]
  | signed x =>
    cases x <;> simp [clauseKey, Label.supported, Label.value, valueKey,
      strictEq, integerValue, Option.filter, mathematicalNumberEq, range]
    case integer m =>
      constructor
      · rintro ⟨_, rfl⟩; rfl
      · intro same; subst m; exact ⟨range, rfl⟩
    case negativeZero => simp [keyRange, eq_comm]

theorem first_key_correct (cs : List Clause) (literal : allLiteral cs)
    (n : Int) (range : keyRange n) :
    firstKey cs n = search strictEq (.number (.integer n)) cs := by
  induction cs with
  | nil => rfl
  | cons c cs ih =>
    have parts : c.test.all Label.supported = true ∧ allLiteral cs := by
      simpa [allLiteral] using literal
    have tail := parts.2
    cases h : c.test with
    | none => simp [firstKey, clauseKey, search, h, ih tail]
    | some l =>
      have supp : l.supported = true := by simpa [h] using parts.1
      have bridge := key_matches l supp n range
      have ck : clauseKey c = clauseKey ⟨some l, 0⟩ := by simp [clauseKey, h]
      simp [firstKey, search, h, ck, bridge, ih tail]

private theorem fold_bounds (keys : List Int) (start : Int)
    (valid : keyRange start) (others : ∀ n ∈ keys, keyRange n) :
    keyRange (keys.foldl min start) ∧ keyRange (keys.foldl max start) := by
  induction keys generalizing start with
  | nil => exact ⟨valid, valid⟩
  | cons k ks ih =>
    have hk := others k (by simp)
    have tail : ∀ n ∈ ks, keyRange n := fun n hn => others n (by simp [hn])
    have lower : keyRange (min start k) := by unfold keyRange at *; omega
    have upper : keyRange (max start k) := by unfold keyRange at *; omega
    exact ⟨(ih _ lower tail).1, (ih _ upper tail).2⟩

private theorem fold_extrema (keys : List Int) (start : Int) :
    (keys.foldl min start ≤ start ∧ start ≤ keys.foldl max start) ∧
      ∀ n ∈ keys, keys.foldl min start ≤ n ∧ n ≤ keys.foldl max start := by
  induction keys generalizing start with
  | nil => simp
  | cons k ks ih =>
    have lo := ih (min start k)
    have hi := ih (max start k)
    simp only [List.foldl_cons]
    refine ⟨by have := lo.1; have := hi.1; omega, ?_⟩
    intro n hn
    simp only [List.mem_cons] at hn
    rcases hn with rfl | hn
    · have := lo.1; have := hi.1; omega
    · exact ⟨(lo.2 n hn).1, (hi.2 n hn).2⟩

private theorem mem_distinct_loop (keys acc : List Int) (n : Int) :
    n ∈ List.eraseDups.loop keys acc ↔ n ∈ keys ∨ n ∈ acc := by
  induction keys generalizing acc with
  | nil => simp [List.eraseDups.loop]
  | cons k ks ih =>
    simp only [List.eraseDups.loop]
    split <;> rw [ih] <;> by_cases same : n = k <;>
      simp_all [or_assoc, or_left_comm, or_comm]

theorem distinct_keys_membership (keys : List Int) (n : Int) :
    n ∈ keys.eraseDups ↔ n ∈ keys := by
  simpa [List.eraseDups] using mem_distinct_loop keys [] n

private theorem nodup_distinct_loop (keys acc : List Int) (unique : acc.Nodup) :
    (List.eraseDups.loop keys acc).Nodup := by
  induction keys generalizing acc with
  | nil => simpa [List.eraseDups.loop, List.Nodup, List.pairwise_reverse, ne_comm] using unique
  | cons k ks ih =>
    simp only [List.eraseDups.loop]
    split
    · exact ih acc unique
    · apply ih
      simp_all

theorem distinct_keys_unique (keys : List Int) : keys.eraseDups.Nodup :=
  nodup_distinct_loop keys [] (by simp)

/-- The construction below produces this table certificate. Its
cells are constructed, not hypothesized to agree with the specification. -/
structure Table (cs : List Clause) where
  low : Int
  high : Int
  literal : allLiteral cs
  lowBound : keyRange low
  highBound : keyRange high
  ordered : low ≤ high
  covers : ∀ n ∈ cs.filterMap clauseKey, low ≤ n ∧ n ≤ high
  count : Nat
  distinct : count = ((cs.filterMap clauseKey).eraseDups).length
  enough : 4 ≤ count
  density : (high - low + 1).toNat ≤ max 16 (4 * count)
  limit : (high - low + 1).toNat ≤ 1024

def Table.length {cs : List Clause} (t : Table cs) : Nat := (t.high - t.low + 1).toNat

def Table.cells {cs : List Clause} (t : Table cs) : List (Option Nat) :=
  (List.range t.length).map (fun (i : Nat) => firstKey cs (t.low + (i : Int)))

/-- The same supported-literal, distinct-key, min/max, density and span tests
as control.ts. Unsupported tests reject the WHOLE table; fractions do not. -/
def buildTable (cs : List Clause) : Option (Table cs) := by
  let keys := (cs.filterMap clauseKey).eraseDups
  if literal : allLiteral cs then
    if enough : 4 ≤ keys.length then
      match hkeys : keys with
      | [] => simp [hkeys] at enough
      | k :: ks =>
        let low := ks.foldl min k
        let high := ks.foldl max k
        have valid : ∀ n ∈ keys, keyRange n := by
          intro n hn
          have member : n ∈ cs.filterMap clauseKey := (distinct_keys_membership _ n).mp hn
          obtain ⟨c, _, hc⟩ := List.mem_filterMap.mp member
          exact key_bounded c n hc
        have bounds := fold_bounds ks k (valid k (by simp [hkeys]))
          (fun n hn => valid n (by simp [hkeys, hn]))
        have order := fold_extrema ks k
        have covers : ∀ n ∈ cs.filterMap clauseKey, low ≤ n ∧ n ≤ high := by
          intro n hn
          have member : n ∈ keys := (distinct_keys_membership _ n).mpr hn
          rw [hkeys] at member
          simp only [List.mem_cons] at member
          rcases member with rfl | member
          · exact order.1
          · exact order.2 n member
        if dense : (high - low + 1).toNat ≤ max 16 (4 * keys.length) then
          if limit : (high - low + 1).toNat ≤ 1024 then
            exact some ⟨low, high, literal, bounds.1, bounds.2,
              by dsimp [low, high]; have := order.1; omega, covers,
              keys.length, rfl, by simpa [hkeys] using enough, dense, limit⟩
          else exact none
        else exact none
    else exact none
  else exact none

theorem constructed_interval {cs : List Clause} (t : Table cs) :
    -2147483648 < t.low ∧ t.low ≤ t.high ∧ t.high < 2147483648 ∧
      t.low + (t.length : Int) = t.high + 1 := by
  have := t.lowBound
  have := t.highBound
  have := t.ordered
  dsimp [Table.length, keyRange] at *
  omega

theorem constructed_key_coverage {cs : List Clause} (t : Table cs)
    (n : Int) (present : n ∈ cs.filterMap clauseKey) :
    t.low ≤ n ∧ n ≤ t.high := t.covers n present

theorem constructed_lookup {cs : List Clause} (t : Table cs) (i : Nat)
    (bound : i < t.length) :
    t.cells[i]? = some (firstKey cs (t.low + i)) := by
  simp [Table.cells, List.getElem?_map, List.getElem?_range bound]

/-- The actual x64 sequence: Number tag (outside this function), signed
64-bit truncation, binary64 round trip, PF/ZF tests, SUB modulo 2^64 and
unsigned index comparison. There is no int32 sign-extension check. -/
def tableAdmission {cs : List Clause} (encode : Int → Number) (t : Table cs)
    (x : Number) : Prop :=
  ¬ unordered (encode (cvtt x)) x ∧ equalFlag (encode (cvtt x)) x ∧
    (cvtt x - t.low) % 18446744073709551616 < (t.length : Int)

instance {cs : List Clause} (encode : Int → Number) (t : Table cs) (x : Number) :
    Decidable (tableAdmission encode t x) := by unfold tableAdmission; infer_instance

theorem admitted_interval {cs : List Clause} (t : Table cs) (x : Number) :
    (cvtt x - t.low) % 18446744073709551616 < (t.length : Int) ↔
      t.low ≤ cvtt x ∧ cvtt x ≤ t.high := by
  have bounds := constructed_interval t
  have wide := cvtt_fits x
  have h := SwitchIndex.unsigned_index_exact (cvtt x) t.low (t.length : Int)
    wide.1 (by have := wide.2; omega) (by omega) (by omega) (by omega)
  omega

theorem table_admission_exact {cs : List Clause} (encode : Int → Number)
    (encoding : ExactInt32Encoding encode) (t : Table cs) (x : Number) :
    tableAdmission encode t x ↔
      ∃ n, t.low ≤ n ∧ n ≤ t.high ∧ integerValue x = some n := by
  constructor
  · rintro ⟨ordered, equal, index⟩
    obtain ⟨lo, hi⟩ := (admitted_interval t x).mp index
    have bounds := constructed_interval t
    have fits : InInt32 (cvtt x) := by unfold InInt32; omega
    have cmp := (ordered_equal _ _).mp ⟨ordered, equal⟩
    rw [encoding _ fits] at cmp
    exact ⟨cvtt x, lo, hi, (integer_comparison _ _).mp cmp⟩
  · rintro ⟨n, lo, hi, value⟩
    have bounds := constructed_interval t
    have fits : InInt32 n := by unfold InInt32; omega
    have conversion := cvtt_integral x n value fits
    have flags := (ordered_equal (.integer n) x).mpr ((integer_comparison n x).mpr value)
    refine ⟨?_, ?_, (admitted_interval t x).mpr (by simpa [conversion] using And.intro lo hi)⟩
    · simpa [conversion, encoding n fits] using flags.1
    · simpa [conversion, encoding n fits] using flags.2

def dispatch {cs : List Clause} (encode : Int → Number) (t : Table cs)
    (x : Value) (endTarget : Nat) : Nat :=
  match x with
  | .number n =>
      if tableAdmission encode t n then
        ((t.cells[(cvtt n - t.low).toNat]?).join).getD (defaultTarget cs endTarget)
      else chain cs x endTarget
  | _ => chain cs x endTarget

private theorem integer_search (cs : List Clause) (x : Number) (n : Int)
    (value : integerValue x = some n) :
    search strictEq (.number x) cs = search strictEq (.number (.integer n)) cs := by
  cases x <;> simp [integerValue] at value
  · cases value; rfl
  · cases value
    have eq (v : Value) : strictEq (.number .negativeZero) v ↔
        strictEq (.number (.integer 0)) v := by
      cases v <;> simp [strictEq]
      case number y => cases y <;> simp [mathematicalNumberEq, eq_comm]
    induction cs with
    | nil => rfl
    | cons c cs ih => cases h : c.test <;> simp [search, h, eq, ih]

/-- First matching source clause, otherwise default/end. Holes go directly
to default/end; conversion rejection takes the complete source-order chain. -/
theorem table_chain_correct {cs : List Clause} (encode : Int → Number)
    (encoding : ExactInt32Encoding encode) (t : Table cs)
    (x : Value) (endTarget : Nat) :
    dispatch encode t x endTarget = linear cs x endTarget := by
  cases x <;> simp only [dispatch]
  case number x =>
    split
    next admitted =>
      obtain ⟨n, lo, hi, value⟩ := (table_admission_exact encode encoding t x).mp admitted
      have bounds := constructed_interval t
      have fits : InInt32 n := by unfold InInt32; omega
      have conversion := cvtt_integral x n value fits
      have idx : (n - t.low).toNat < t.length := by omega
      have pos : t.low + ((n - t.low).toNat : Int) = n := by omega
      rw [conversion, constructed_lookup t _ idx, pos]
      change (firstKey cs n).getD (defaultTarget cs endTarget) = _
      rw [first_key_correct cs t.literal n (by unfold keyRange; omega)]
      simp [linear, integer_search cs x n value]
    next => exact all_chain_correct cs _ endTarget
  all_goals exact all_chain_correct cs _ endTarget

def selectedDispatch (encode : Int → Number) (cs : List Clause)
    (x : Value) (endTarget : Nat) : Nat :=
  match buildTable cs with
  | none => chain cs x endTarget
  | some t => dispatch encode t x endTarget

theorem selected_dispatch_correct (encode : Int → Number)
    (encoding : ExactInt32Encoding encode) (cs : List Clause)
    (x : Value) (endTarget : Nat) :
    selectedDispatch encode cs x endTarget = linear cs x endTarget := by
  unfold selectedDispatch
  split
  · exact all_chain_correct cs x endTarget
  · exact table_chain_correct encode encoding _ x endTarget

/-- Any unchanged body continuation has the same observation after dispatch.
This includes source-ordered fallthrough successors, but does not verify the
body interpreter, exceptions, lexical environments or evaluation of labels. -/
theorem selected_continuation_correct {Observation : Type}
    (continueAt : Nat → Observation) (encode : Int → Number)
    (encoding : ExactInt32Encoding encode) (cs : List Clause)
    (x : Value) (endTarget : Nat) :
    continueAt (selectedDispatch encode cs x endTarget) =
      continueAt (linear cs x endTarget) := by
  rw [selected_dispatch_correct encode encoding]

end Nona.Switch
