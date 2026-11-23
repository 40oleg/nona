import Nona.FractionIdentity

namespace Nona.Switch

open Numeric

/-- Independent mathematical strict Number equality. Nonintegral proper
dyadics cannot equal integers (fraction_nonintegral); signs and cross products
compare fractional values, even when their denominator exponents differ. -/
def mathematicalNumberEq : Number → Number → Prop
  | .integer a, .integer b => a = b
  | .negativeZero, .integer b => b = 0
  | .integer a, .negativeZero => a = 0
  | .negativeZero, .negativeZero => True
  | .fraction f, .fraction g =>
      f.negative = g.negative ∧
        (f.whole * f.denominator + f.numerator) * g.denominator =
        (g.whole * g.denominator + g.numerator) * f.denominator
  | .positiveInfinity, .positiveInfinity => True
  | .negativeInfinity, .negativeInfinity => True
  | _, _ => False

instance (x y : Number) : Decidable (mathematicalNumberEq x y) := by
  cases x <;> cases y <;> unfold mathematicalNumberEq <;> infer_instance

theorem strict_number_correct (x y : Number) :
    numberEq x y ↔ mathematicalNumberEq x y := by
  cases x <;> cases y <;>
    simp [mathematicalNumberEq, numberEq, integerValue, fraction_identity, eq_comm]

/-- Non-Number identities are opaque; no coercion or valueOf is performed.
Object/symbol identities can share this opaque identity domain. -/
inductive Value where
  | number (n : Number)
  | string (s : String)
  | boolean (b : Bool)
  | bigint (n : Int)
  | null
  | undefined
  | identity (id : Nat)
  deriving DecidableEq

def strictEq : Value → Value → Prop
  | .number x, .number y => mathematicalNumberEq x y
  | .string x, .string y => x = y
  | .boolean x, .boolean y => x = y
  | .bigint x, .bigint y => x = y
  | .null, .null | .undefined, .undefined => True
  | .identity x, .identity y => x = y
  | _, _ => False

def chainEq : Value → Value → Prop
  | .number x, .number y => numberEq x y
  | x, y => x = y

instance (x y : Value) : Decidable (strictEq x y) := by
  cases x <;> cases y <;> unfold strictEq <;> infer_instance

instance (x y : Value) : Decidable (chainEq x y) := by
  cases x <;> cases y <;> unfold chainEq <;> infer_instance

theorem strict_equality_correct (x y : Value) : chainEq x y ↔ strictEq x y := by
  cases x <;> cases y <;> simp [chainEq, strictEq, strict_number_correct]

end Nona.Switch
