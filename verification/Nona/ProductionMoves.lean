import Nona.MoveRules

/-!
Production move-guard correspondence, separate from the original single-write
model. The contracts below describe operand reads, simultaneous multiple writes
and observable events; they do not assume that an optimization preserves them.
CFG fixed-point computation, numeric annotations and backend implementations
must establish these contracts (see docs/formal-verification.md).
-/
namespace Nona.Production

abbrev Alias := Slot → Option Slot
def empty : Alias := fun _ => none
def resolve (a : Alias) (k : Slot) : Slot := (a k).getD k
def Valid (a : Alias) (s : State V) : Prop :=
  ∀ k v, a k = some v → s k = s v

theorem empty_valid (s : State V) : Valid empty s := by
  intro k v h
  simp [empty] at h

theorem resolve_valid (a : Alias) (s : State V) (h : Valid a s) (k : Slot) :
    s (resolve a k) = s k := by
  cases hk : a k with
  | none => simp [resolve, hk]
  | some v => simpa [resolve, hk] using (h k v hk).symm

/-- Delete both keys and targets for *every* definition, not just `dest`. -/
def invalidate (a : Alias) (defs : List Slot) : Alias := fun k =>
  if k ∈ defs then none else
    match a k with
    | none => none
    | some v => if v ∈ defs then none else some v

theorem invalidate_valid (a : Alias) (defs : List Slot) (s t : State V)
    (valid : Valid a s) (frame : ∀ k, k ∉ defs → t k = s k) :
    Valid (invalidate a defs) t := by
  intro k v h
  by_cases key : k ∈ defs
  · simp [invalidate, key] at h
  · cases hv : a k with
    | none => simp [invalidate, key, hv] at h
    | some target =>
      by_cases hit : target ∈ defs
      · simp [invalidate, key, hv, hit] at h
      · have eq : target = v := by simpa [invalidate, key, hv, hit] using h
        subst v
        rw [frame k key, frame target hit]
        exact valid k target hv

def insert (a : Alias) (dest source : Slot) : Alias :=
  if dest = source then a else fun k => if k = dest then some source else a k

theorem insert_valid (a : Alias) (s : State V) (dest source : Slot)
    (valid : Valid a s) (same : s dest = s source) :
    Valid (insert a dest source) s := by
  by_cases self : dest = source
  · simpa [insert, self] using valid
  · intro k v h
    by_cases key : k = dest
    · have hv : source = v := by simpa [insert, self, key] using h
      subst k; subst v
      exact same
    · exact valid k v (by simpa [insert, self, key] using h)

theorem copy_update_valid (a : Alias) (s : State V) (dest source : Slot)
    (valid : Valid a s) :
    Valid (insert (invalidate a [dest]) dest (resolve a source))
      (write s dest (s (resolve a source))) := by
  have kept : Valid (invalidate a [dest]) (write s dest (s (resolve a source))) :=
    invalidate_valid a [dest] s _ valid (by
      intro k h
      simp only [List.mem_singleton] at h
      simp [write, h])
  apply insert_valid _ _ _ _ kept
  by_cases self : dest = resolve a source
  · simp [self]
  · simp [write, Ne.symm self]

/-- A flag marks each operand occurrence that rewriteUses supports. False
operands remain actual reads: checks, captures, literal keys, iterator uses etc.
All values and events are evaluated from old operand values, before any write.
Multiple definitions include getIterator's iterator/next, iteratorStep's done,
and yieldDelegated's mode. No operation may silently write another local slot. -/
structure Op (V Event : Type) where
  operands : List (Bool × Slot)
  defs : List Slot
  values : List V → Slot → V
  events : List V → List Event

def args (op : Op V E) (s : State V) : List V :=
  op.operands.map (fun operand => s operand.2)
def exec (op : Op V E) (s : State V) : State V := fun k =>
  if k ∈ op.defs then op.values (args op s) k else s k
def events (op : Op V E) (s : State V) : List E := op.events (args op s)
def rewrite (a : Alias) (op : Op V E) : Op V E :=
  { op with operands := op.operands.map fun (forward, k) =>
      (forward, if forward then resolve a k else k) }

theorem exec_frame (op : Op V E) (s : State V) (k : Slot) (h : k ∉ op.defs) :
    exec op s k = s k := by simp [exec, h]

theorem rewrite_args (a : Alias) (op : Op V E) (s : State V)
    (valid : Valid a s) : args (rewrite a op) s = args op s := by
  simp only [args, rewrite, List.map_map]
  apply List.map_congr_left
  intro operand _
  rcases operand with ⟨forward, k⟩
  cases forward <;> simp [resolve_valid a s valid]

/-- Equality of rewritten execution is derived from equality of operand values;
neither execution equality nor alias preservation is a premise. -/
theorem rewrite_correct (a : Alias) (op : Op V E) (s : State V)
    (valid : Valid a s) :
    exec (rewrite a op) s = exec op s ∧ events (rewrite a op) s = events op s := by
  have h := rewrite_args a op s valid
  constructor
  · funext k
    change (if k ∈ op.defs then op.values (args (rewrite a op) s) k else s k) =
      (if k ∈ op.defs then op.values (args op s) k else s k)
    rw [h]
  · exact congrArg op.events h

theorem operation_update_valid (a : Alias) (op : Op V E) (s : State V)
    (valid : Valid a s) : Valid (invalidate a op.defs) (exec (rewrite a op) s) := by
  rw [(rewrite_correct a op s valid).1]
  exact invalidate_valid a op.defs s _ valid (exec_frame op s)

inductive Command (V E : Type) where
  | copy (dest source : Slot)
  | operation (op : Op V E)

def commandExec : Command V E → State V → State V
  | .copy d r, s => write s d (s r)
  | .operation op, s => exec op s
def commandEvents : Command V E → State V → List E
  | .copy _ _, _ => []
  | .operation op, s => events op s
def forward (a : Alias) : Command V E → Command V E × Alias
  | .copy d r => (.copy d (resolve a r), insert (invalidate a [d]) d (resolve a r))
  | .operation op => (.operation (rewrite a op), invalidate a op.defs)

theorem forward_step (a : Alias) (c : Command V E) (s : State V)
    (valid : Valid a s) :
    commandExec (forward a c).1 s = commandExec c s ∧
    commandEvents (forward a c).1 s = commandEvents c s ∧
    Valid (forward a c).2 (commandExec c s) := by
  cases c with
  | copy d r =>
    have h := resolve_valid a s valid r
    refine ⟨?_, rfl, ?_⟩
    · simp [forward, commandExec, h]
    · simpa [forward, commandExec, h] using copy_update_valid a s d r valid
  | operation op =>
    have h := rewrite_correct a op s valid
    exact ⟨h.1, h.2, invalidate_valid a op.defs s _ valid (exec_frame op s)⟩

def runCommands : List (Command V E) → State V → State V × List E
  | [], s => (s, [])
  | c :: rest, s =>
    let tail := runCommands rest (commandExec c s)
    (tail.1, commandEvents c s ++ tail.2)
def forwardBlock : Alias → List (Command V E) → List (Command V E) × Alias
  | a, [] => ([], a)
  | a, c :: rest =>
    let next := forward a c
    let tail := forwardBlock next.2 rest
    (next.1 :: tail.1, tail.2)

theorem forward_block_correct (p : List (Command V E)) (a : Alias) (s : State V)
    (valid : Valid a s) :
    runCommands (forwardBlock a p).1 s = runCommands p s ∧
    Valid (forwardBlock a p).2 (runCommands p s).1 := by
  induction p generalizing a s with
  | nil => exact ⟨rfl, valid⟩
  | cons c rest ih =>
    obtain ⟨state, trace, next⟩ := forward_step a c s valid
    obtain ⟨tail, final⟩ := ih (forward a c).2 (commandExec c s) next
    constructor
    · simp only [forwardBlock, runCommands]
      rw [state, tail, trace]
    · exact final

/-- Return/throw/branch/switch read the final state's resolved slot. Each new
block starts with empty, irrespective of predecessor maps or loop iteration. -/
theorem block_terminator_correct (p : List (Command V E)) (s : State V) (k : Slot) :
    let result := forwardBlock empty p
    (runCommands result.1 s).1 (resolve result.2 k) = (runCommands p s).1 k := by
  obtain ⟨state, valid⟩ := forward_block_correct p empty s (empty_valid s)
  dsimp
  rw [state]
  exact resolve_valid _ _ valid k

/-- Effective liveness is production isLive: locals below liveFloor are pinned. -/
def Live (floor : Nat) (set : List Slot) (k : Slot) : Prop := k < floor ∨ k ∈ set
def Observes (live : Slot → Prop) (s t : State V) : Prop :=
  ∀ k, live k → s k = t k
def reads (op : Op V E) : List Slot := op.operands.map Prod.snd
/-- Kill ALL definitions, then add reads. Extra observations include handler
entry liveness at every instruction, as in analyzeLiveness. -/
def transfer (op : Op V E) (after extra : Slot → Prop) : Slot → Prop := fun k =>
  k ∈ reads op ∨ (after k ∧ k ∉ op.defs) ∨ extra k

theorem args_congr (op : Op V E) (s t : State V)
    (h : Observes (fun k => k ∈ reads op) s t) : args op s = args op t := by
  apply List.map_congr_left
  intro operand member
  exact h operand.2 (List.mem_map.mpr ⟨operand, member, rfl⟩)

theorem transfer_correct (op : Op V E) (after extra : Slot → Prop) (s t : State V)
    (h : Observes (transfer op after extra) s t) :
    Observes after (exec op s) (exec op t) ∧ events op s = events op t ∧
    Observes extra s t := by
  have operands := args_congr op s t (fun k hk => h k (Or.inl hk))
  refine ⟨?_, congrArg op.events operands, fun k hk => h k (Or.inr (Or.inr hk))⟩
  intro k hk
  by_cases written : k ∈ op.defs
  · simp [exec, written, operands]
  · simp [exec, written, h k (Or.inr (Or.inl ⟨hk, written⟩))]

/-- Compact floor sets may omit pinned slots, but effective transfer retains
them. Killing a same-slot definition never kills an operand read. -/
theorem floor_transfer_correct (op : Op V E) (floor : Nat) (set : List Slot)
    (handler : Slot → Prop) (s t : State V)
    (h : Observes (fun k => k < floor ∨ transfer op (Live floor set) handler k) s t) :
    Observes (Live floor set) (exec op s) (exec op t) ∧
    events op s = events op t := by
  have result := transfer_correct op (Live floor set) handler s t
    (fun k hk => h k (Or.inr hk))
  exact ⟨result.1, result.2.1⟩

def liveBefore : List (Op V E) → (Slot → Prop) → (Slot → Prop) → Slot → Prop
  | [], boundary, _ => boundary
  | op :: rest, boundary, handler => transfer op (liveBefore rest boundary handler) handler
def runOps : List (Op V E) → State V → State V × List E
  | [], s => (s, [])
  | op :: rest, s =>
    let tail := runOps rest (exec op s)
    (tail.1, events op s ++ tail.2)

theorem continuation_correct (p : List (Op V E)) (boundary handler : Slot → Prop)
    (s t : State V) (h : Observes (liveBefore p boundary handler) s t) :
    Observes boundary (runOps p s).1 (runOps p t).1 ∧
    (runOps p s).2 = (runOps p t).2 := by
  induction p generalizing s t with
  | nil => exact ⟨h, rfl⟩
  | cons op rest ih =>
    obtain ⟨next, trace, _⟩ := transfer_correct op _ handler s t h
    obtain ⟨final, traces⟩ := ih (exec op s) (exec op t) next
    exact ⟨final, by simp only [runOps]; rw [trace, traces]⟩

def HandlerAgreement : List (Op V E) → (Slot → Prop) → State V → State V → Prop
  | [], _, _, _ => True
  | op :: rest, handler, s, t =>
    Observes handler s t ∧ HandlerAgreement rest handler (exec op s) (exec op t)

/-- Each pre-operation handler observation agrees, not just the block exit.
This checks the boundary obligation for an exception at any instruction; it
does not give an operational semantics or fixed-point proof for exception CFGs. -/
theorem continuation_handlers (p : List (Op V E)) (boundary handler : Slot → Prop)
    (s t : State V) (h : Observes (liveBefore p boundary handler) s t) :
    HandlerAgreement p handler s t := by
  induction p generalizing s t with
  | nil => trivial
  | cons op rest ih =>
    obtain ⟨next, _, entry⟩ := transfer_correct op _ handler s t h
    exact ⟨entry, ih (exec op s) (exec op t) next⟩

/-- Successor entries (including back edges), terminator reads and exceptional
observations must all be included in the supplied boundary. No fixed-point
solver is assumed correct by this theorem. -/
theorem boundary_observations (boundary successor terminator handler : Slot → Prop)
    (s t : State V)
    (covers : ∀ k, successor k ∨ terminator k ∨ handler k → boundary k)
    (h : Observes boundary s t) :
    Observes successor s t ∧ Observes terminator s t ∧ Observes handler s t := by
  exact ⟨fun k hk => h k (covers k (Or.inl hk)),
    fun k hk => h k (covers k (Or.inr (Or.inl hk))),
    fun k hk => h k (covers k (Or.inr (Or.inr hk)))⟩

theorem effective_dead (floor : Nat) (set : List Slot) (k : Slot)
    (dead : ¬ Live floor set k) : floor ≤ k ∧ k ∉ set := by
  exact ⟨Nat.le_of_not_gt (fun h => dead (Or.inl h)), fun h => dead (Or.inr h)⟩

/-- Pure single-write operations have a concrete constructor. Their silence and
write frame follow by reduction; neither is a preservation axiom. The callback
is total and pure: numeric soundness and the production eligibility table are
separate obligations, not arbitrary permissions to remove effectful operations. -/
def producer (operands : List (Bool × Slot)) (dest : Slot) (value : List V → V) : Op V E :=
  ⟨operands, [dest], fun vs _ => value vs, fun _ => []⟩

theorem producer_exec (operands : List (Bool × Slot)) (dest : Slot)
    (value : List V → V) (s : State V) :
    exec (producer operands dest value : Op V E) s =
      write s dest (value (operands.map fun operand => s operand.2)) := by
  funext k
  simp [exec, producer, args, write]

/-- A total extension on malformed operand lists is irrelevant to execution:
the constructed copy always supplies exactly one old-state operand. -/
def copyProducer (dest source : Slot) (fallback : V) : Op V E :=
  producer [(true, source)] dest (fun values => values.headD fallback)

theorem copy_producer_exec (dest source : Slot) (fallback : V) (s : State V) :
    exec (copyProducer dest source fallback : Op V E) s = write s dest (s source) := by
  rw [copyProducer, producer_exec]
  rfl

theorem dead_producer_continuation (operands : List (Bool × Slot)) (dest : Slot)
    (value : List V → V) (rest : List (Op V E)) (boundary handler : Slot → Prop)
    (floor : Nat) (set : List Slot) (s : State V)
    (covers : ∀ k, liveBefore rest boundary handler k → Live floor set k)
    (dead : ¬ Live floor set dest) :
    Observes boundary (runOps (producer operands dest value :: rest) s).1 (runOps rest s).1 ∧
    (runOps (producer operands dest value :: rest) s).2 = (runOps rest s).2 := by
  have h : Observes (liveBefore rest boundary handler)
      (exec (producer operands dest value : Op V E) s) s := by
    intro k hk
    have different : k ≠ dest := fun eq => dead (eq ▸ covers k hk)
    simp [exec, producer, different]
  exact continuation_correct rest boundary handler _ s h

/-- Adjacent producer/copy replacement is compared *before* executing the
continuation. All producer operands are read from s, even when dest is one of
them. The algebra also permits a self-copy; production conservatively skips it.
Eligibility, matching source and adjacency are represented by this exact shape. -/
theorem coalesce_producer_continuation (operands : List (Bool × Slot))
    (temp dest : Slot) (value : List V → V) (rest : List (Op V E))
    (boundary handler : Slot → Prop) (floor : Nat) (set : List Slot) (s : State V)
    (covers : ∀ k, liveBefore rest boundary handler k → Live floor set k)
    (dead : ¬ Live floor set temp) :
    let original := exec (producer operands temp value : Op V E) s
    let replaced := exec (producer operands dest value : Op V E) s
    Observes boundary (runOps rest (write original dest (original temp))).1
      (runOps rest replaced).1 ∧
    (runOps rest (write original dest (original temp))).2 = (runOps rest replaced).2 := by
  apply continuation_correct rest boundary handler
  intro k hk
  have different : k ≠ temp := fun eq => dead (eq ▸ covers k hk)
  simp [exec, producer, args, write, different]

/-- Only the pure constructor is eligible for removal. An effectful or otherwise
unsupported operation stays even when it has no observed destination. -/
inductive Item (V E : Type) where
  | pure (operands : List (Bool × Slot)) (dest : Slot) (value : List V → V)
  | keep (op : Op V E)

def itemOp : Item V E → Op V E
  | .pure operands dest value => producer operands dest value
  | .keep op => op
def itemOps (p : List (Item V E)) : List (Op V E) := p.map itemOp

/-- One elimination round uses liveness of the original suffix, not the already
optimized suffix. This distinction makes long chains require multiple rounds. -/
noncomputable def eliminate (p : List (Item V E)) (boundary handler : Slot → Prop)
    (floor : Nat) : List (Item V E) := by
  classical
  exact match p with
  | [] => []
  | c :: rest =>
    let tail := eliminate rest boundary handler floor
    match c with
    | .pure _ dest _ =>
      if dest < floor ∨ liveBefore (itemOps rest) boundary handler dest then c :: tail else tail
    | .keep _ => c :: tail

theorem eliminate_correct (p : List (Item V E)) (boundary handler : Slot → Prop)
    (floor : Nat) (s : State V) :
    Observes boundary (runOps (itemOps (eliminate p boundary handler floor)) s).1
      (runOps (itemOps p) s).1 ∧
    (runOps (itemOps (eliminate p boundary handler floor)) s).2 =
      (runOps (itemOps p) s).2 := by
  classical
  induction p generalizing s with
  | nil => exact ⟨fun _ _ => rfl, rfl⟩
  | cons c rest ih =>
    cases c with
    | keep op =>
      obtain ⟨state, trace⟩ := ih (exec op s)
      exact ⟨state, by simpa [eliminate, itemOps, itemOp, runOps] using
        (congrArg (fun xs => events op s ++ xs) trace)⟩
    | pure operands dest value =>
      by_cases live : dest < floor ∨ liveBefore (itemOps rest) boundary handler dest
      · simp only [eliminate, if_pos live]
        obtain ⟨state, trace⟩ := ih (exec (producer operands dest value) s)
        simpa [itemOps, itemOp, runOps, events, producer] using
          And.intro state trace
      · simp only [eliminate, if_neg live]
        have agreement : Observes (liveBefore (itemOps rest) boundary handler)
            s (exec (producer operands dest value : Op V E) s) := by
          intro k hk
          have different : k ≠ dest := fun eq => live (Or.inr (eq ▸ hk))
          simp [exec, producer, different]
        obtain ⟨continuation, traces⟩ := continuation_correct (itemOps rest)
          boundary handler s _ agreement
        obtain ⟨state, trace⟩ := ih s
        constructor
        · intro k hk
          exact (state k hk).trans (continuation k hk)
        · simpa [itemOps, itemOp, runOps, events, producer] using
            trace.trans traces

noncomputable def rounds : Nat → List (Item V E) → (Slot → Prop) →
    (Slot → Prop) → Nat → List (Item V E)
  | 0, p, _, _, _ => p
  | n + 1, p, boundary, handler, floor =>
    rounds n (eliminate p boundary handler floor) boundary handler floor

/-- Liveness is recomputed from the changed program each round. Soundness is
derived from eliminate_correct, not supplied as a premise. n=4 models the
production effort limit; this does not assert elimination reaches a fixed point. -/
theorem bounded_dce_correct (n : Nat) (p : List (Item V E))
    (boundary handler : Slot → Prop) (floor : Nat) (s : State V) :
    Observes boundary (runOps (itemOps (rounds n p boundary handler floor)) s).1
      (runOps (itemOps p) s).1 ∧
    (runOps (itemOps (rounds n p boundary handler floor)) s).2 =
      (runOps (itemOps p) s).2 := by
  induction n generalizing p with
  | zero => exact ⟨fun _ _ => rfl, rfl⟩
  | succ n ih =>
    obtain ⟨state, trace⟩ := ih (eliminate p boundary handler floor)
    obtain ⟨one, events⟩ := eliminate_correct p boundary handler floor s
    exact ⟨fun k hk => (state k hk).trans (one k hk), trace.trans events⟩

end Nona.Production
