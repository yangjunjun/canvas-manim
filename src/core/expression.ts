type Token = { type: 'number' | 'name' | 'symbol' | 'end'; value: string }
type Expr = { kind: 'number'; value: number } | { kind: 'name'; value: string } | { kind: 'unary'; op: string; arg: Expr } | { kind: 'binary'; op: string; left: Expr; right: Expr } | { kind: 'call'; name: string; args: Expr[] }

const functions: Record<string, (...args: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos,
  atan: Math.atan, sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor,
  ceil: Math.ceil, round: Math.round, min: Math.min, max: Math.max,
  pow: Math.pow, log: Math.log, exp: Math.exp,
}
const cache = new Map<string, Expr>()

function tokenize(input: string): Token[] {
  if (input.length > 300) throw new Error('表达式过长（最多 300 字符）')
  const tokens: Token[] = []
  let offset = 0
  while (offset < input.length) {
    const rest = input.slice(offset)
    const space = /^\s+/.exec(rest)
    if (space) { offset += space[0].length; continue }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest)
    if (number) { tokens.push({ type: 'number', value: number[0] }); offset += number[0].length; continue }
    const name = /^[A-Za-z_][A-Za-z_0-9]*/.exec(rest)
    if (name) { tokens.push({ type: 'name', value: name[0] }); offset += name[0].length; continue }
    if ('+-*/^(),'.includes(rest[0])) { tokens.push({ type: 'symbol', value: rest[0] }); offset++; continue }
    throw new Error(`表达式第 ${offset + 1} 个字符无效`)
  }
  tokens.push({ type: 'end', value: '' })
  return tokens
}

function parse(input: string): Expr {
  const cached = cache.get(input)
  if (cached) return cached
  const tokens = tokenize(input)
  let index = 0
  const peek = () => tokens[index]
  const take = () => tokens[index++]
  const expect = (value: string) => {
    if (peek().value !== value) throw new Error(`表达式需要「${value}」`)
    take()
  }
  const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 }
  function expression(min = 0, depth = 0): Expr {
    if (depth > 32) throw new Error('表达式嵌套过深')
    let left: Expr
    const token = take()
    if (token.type === 'number') left = { kind: 'number', value: Number(token.value) }
    else if (token.value === '+' || token.value === '-') left = { kind: 'unary', op: token.value, arg: expression(3, depth + 1) }
    else if (token.value === '(') { left = expression(0, depth + 1); expect(')') }
    else if (token.type === 'name') {
      if (peek().value === '(') {
        take()
        const args: Expr[] = []
        if (peek().value !== ')') {
          do { args.push(expression(0, depth + 1)); if (peek().value !== ',') break; take() } while (true)
        }
        expect(')')
        if (!(token.value in functions) || args.length > 8 || args.length === 0) throw new Error(`不支持函数 ${token.value}`)
        left = { kind: 'call', name: token.value, args }
      } else left = { kind: 'name', value: token.value }
    } else throw new Error('表达式缺少数字、变量或括号')
    while (peek().type === 'symbol' && (precedence[peek().value] ?? 0) >= min && peek().value in precedence) {
      const op = take().value
      const priority = precedence[op]
      const right = expression(priority + (op === '^' ? 0 : 1), depth + 1)
      left = { kind: 'binary', op, left, right }
    }
    return left
  }
  const ast = expression()
  if (peek().type !== 'end') throw new Error(`表达式多余内容「${peek().value}」`)
  if (cache.size > 500) cache.clear()
  cache.set(input, ast)
  return ast
}

export function evaluateExpression(input: string, variables: Record<string, number>): number {
  const ast = parse(input)
  let steps = 0
  function run(node: Expr): number {
    if (++steps > 500) throw new Error('表达式计算量超限')
    if (node.kind === 'number') return node.value
    if (node.kind === 'name') {
      if (node.value === 'pi') return Math.PI
      if (node.value === 'e') return Math.E
      if (!Object.hasOwn(variables, node.value)) throw new Error(`未知变量 ${node.value}`)
      return variables[node.value]
    }
    if (node.kind === 'unary') return node.op === '-' ? -run(node.arg) : run(node.arg)
    if (node.kind === 'call') return functions[node.name](...node.args.map(run))
    const a = run(node.left), b = run(node.right)
    switch (node.op) {
      case '+': return a + b
      case '-': return a - b
      case '*': return a * b
      case '/': return a / b
      case '^': return a ** b
      default: throw new Error('不支持运算')
    }
  }
  return run(ast)
}
