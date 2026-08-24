from __future__ import annotations

from dataclasses import dataclass
from time import monotonic
from typing import Literal

from app.schemas.backtest import (
    AnatoleScriptDiagnostic,
    AnatoleScriptValidation,
)
from app.schemas.stocks import Candle
from app.services.technical_analysis import (
    ema,
    rma,
    rolling_highest,
    rolling_lowest,
    rsi,
    sma,
    true_range,
)


MAX_SCRIPT_LENGTH = 8_000
MAX_TOKENS = 2_048
MAX_STATEMENTS = 120
MAX_OPERATIONS = 250
MAX_INDICATORS = 20
MAX_RUNTIME_SECONDS = 0.25

ALLOWED_FUNCTIONS = {
    "sma",
    "ema",
    "rsi",
    "macd",
    "atr",
    "highest",
    "lowest",
    "crossover",
    "crossunder",
}
MARKET_VARIABLES = {"open", "high", "low", "close", "volume"}


@dataclass(frozen=True, slots=True)
class Token:
    kind: str
    value: str
    line: int
    column: int


@dataclass(frozen=True, slots=True)
class NumberExpression:
    value: float
    line: int
    column: int


@dataclass(frozen=True, slots=True)
class NameExpression:
    name: str
    line: int
    column: int


@dataclass(frozen=True, slots=True)
class CallExpression:
    name: str
    arguments: tuple["Expression", ...]
    line: int
    column: int


@dataclass(frozen=True, slots=True)
class BinaryExpression:
    operator: str
    left: "Expression"
    right: "Expression"
    line: int
    column: int


Expression = NumberExpression | NameExpression | CallExpression | BinaryExpression


@dataclass(frozen=True, slots=True)
class Assignment:
    name: str
    expression: Expression
    line: int


@dataclass(frozen=True, slots=True)
class Instruction:
    kind: Literal["plot", "enter_long", "exit_long"]
    expression: Expression
    line: int


Statement = Assignment | Instruction


@dataclass(frozen=True, slots=True)
class AnatoleProgram:
    kind: Literal["indicator", "strategy"]
    name: str
    statements: tuple[Statement, ...]


@dataclass(frozen=True, slots=True)
class CompiledScript:
    program: AnatoleProgram
    enter_long: list[bool]
    exit_long: list[bool]
    plots: dict[str, list[float | None]]


class AnatoleScriptError(ValueError):
    def __init__(self, message: str, line: int, column: int) -> None:
        super().__init__(message)
        self.message = message
        self.line = line
        self.column = column

    def diagnostic(self) -> AnatoleScriptDiagnostic:
        return AnatoleScriptDiagnostic(
            line=self.line,
            column=self.column,
            message=self.message,
        )


def tokenize(source: str) -> list[Token]:
    if len(source) > MAX_SCRIPT_LENGTH:
        raise AnatoleScriptError(
            f"Le script dépasse {MAX_SCRIPT_LENGTH} caractères.",
            1,
            1,
        )
    tokens: list[Token] = []
    index = 0
    line = 1
    column = 1
    while index < len(source):
        character = source[index]
        if character in " \t\r":
            index += 1
            column += 1
            continue
        if character == "\n":
            tokens.append(Token("newline", "\n", line, column))
            index += 1
            line += 1
            column = 1
            continue
        if character == "#":
            while index < len(source) and source[index] != "\n":
                index += 1
                column += 1
            continue
        if character.isdigit() or (
            character == "."
            and index + 1 < len(source)
            and source[index + 1].isdigit()
        ):
            start = index
            start_column = column
            dots = 0
            while index < len(source) and (
                source[index].isdigit() or source[index] == "."
            ):
                dots += source[index] == "."
                index += 1
                column += 1
            value = source[start:index]
            if dots > 1:
                raise AnatoleScriptError("Nombre invalide.", line, start_column)
            tokens.append(Token("number", value, line, start_column))
            continue
        if character.isalpha() or character == "_":
            start = index
            start_column = column
            while index < len(source) and (
                source[index].isalnum() or source[index] == "_"
            ):
                index += 1
                column += 1
            tokens.append(Token("identifier", source[start:index], line, start_column))
            continue
        if character in {'"', "'"}:
            quote = character
            start_column = column
            index += 1
            column += 1
            value: list[str] = []
            while index < len(source) and source[index] != quote:
                if source[index] == "\n":
                    raise AnatoleScriptError(
                        "Chaîne non terminée.",
                        line,
                        start_column,
                    )
                value.append(source[index])
                index += 1
                column += 1
            if index >= len(source):
                raise AnatoleScriptError(
                    "Chaîne non terminée.",
                    line,
                    start_column,
                )
            index += 1
            column += 1
            tokens.append(Token("string", "".join(value), line, start_column))
            continue
        two = source[index:index + 2]
        if two in {">=", "<=", "==", "!="}:
            tokens.append(Token("operator", two, line, column))
            index += 2
            column += 2
            continue
        kinds = {
            "(": "left_paren",
            ")": "right_paren",
            ",": "comma",
            "=": "assign",
            ">": "operator",
            "<": "operator",
        }
        kind = kinds.get(character)
        if kind is None:
            raise AnatoleScriptError(
                f"Caractère interdit : {character}",
                line,
                column,
            )
        tokens.append(Token(kind, character, line, column))
        index += 1
        column += 1
        if len(tokens) > MAX_TOKENS:
            raise AnatoleScriptError("Script trop complexe.", line, column)
    tokens.append(Token("eof", "", line, column))
    return tokens


class Parser:
    def __init__(self, tokens: list[Token]) -> None:
        self.tokens = tokens
        self.index = 0
        self.operations = 0
        self.indicators = 0
        self.variables: set[str] = set(MARKET_VARIABLES)

    @property
    def current(self) -> Token:
        return self.tokens[self.index]

    def advance(self) -> Token:
        token = self.current
        self.index += 1
        return token

    def accept(self, kind: str, value: str | None = None) -> Token | None:
        token = self.current
        if token.kind == kind and (value is None or token.value == value):
            return self.advance()
        return None

    def expect(self, kind: str, message: str) -> Token:
        token = self.accept(kind)
        if token is None:
            raise AnatoleScriptError(message, self.current.line, self.current.column)
        return token

    def skip_newlines(self) -> None:
        while self.accept("newline") is not None:
            pass

    def count_operation(self, token: Token, *, indicator: bool = False) -> None:
        self.operations += 1
        if indicator:
            self.indicators += 1
        if self.operations > MAX_OPERATIONS:
            raise AnatoleScriptError(
                f"Le script dépasse {MAX_OPERATIONS} opérations.",
                token.line,
                token.column,
            )
        if self.indicators > MAX_INDICATORS:
            raise AnatoleScriptError(
                f"Le script dépasse {MAX_INDICATORS} indicateurs.",
                token.line,
                token.column,
            )

    def parse_expression(self) -> Expression:
        left = self.parse_primary()
        operator = self.accept("operator")
        if operator is None:
            return left
        right = self.parse_primary()
        self.count_operation(operator)
        return BinaryExpression(
            operator=operator.value,
            left=left,
            right=right,
            line=operator.line,
            column=operator.column,
        )

    def parse_primary(self) -> Expression:
        token = self.current
        if token.kind == "number":
            self.advance()
            return NumberExpression(float(token.value), token.line, token.column)
        if token.kind != "identifier":
            raise AnatoleScriptError(
                "Expression attendue.", token.line, token.column
            )
        self.advance()
        if self.accept("left_paren") is not None:
            name = token.value.lower()
            if name not in ALLOWED_FUNCTIONS:
                raise AnatoleScriptError(
                    f"Fonction interdite ou inconnue : {name}",
                    token.line,
                    token.column,
                )
            arguments: list[Expression] = []
            if self.current.kind != "right_paren":
                while True:
                    arguments.append(self.parse_expression())
                    if self.accept("comma") is None:
                        break
            self.expect("right_paren", "Parenthèse fermante attendue.")
            self.validate_arity(name, arguments, token)
            self.count_operation(
                token,
                indicator=name not in {"crossover", "crossunder"},
            )
            return CallExpression(
                name=name,
                arguments=tuple(arguments),
                line=token.line,
                column=token.column,
            )
        if token.value not in self.variables:
            raise AnatoleScriptError(
                f"Variable inconnue : {token.value}",
                token.line,
                token.column,
            )
        return NameExpression(token.value, token.line, token.column)

    @staticmethod
    def validate_arity(
        name: str,
        arguments: list[Expression],
        token: Token,
    ) -> None:
        expected = {
            "sma": {2},
            "ema": {2},
            "rsi": {2},
            "macd": {1, 4},
            "atr": {1},
            "highest": {2},
            "lowest": {2},
            "crossover": {2},
            "crossunder": {2},
        }[name]
        if len(arguments) not in expected:
            options = " ou ".join(str(value) for value in sorted(expected))
            raise AnatoleScriptError(
                f"{name} attend {options} argument(s).",
                token.line,
                token.column,
            )

    def parse(self) -> AnatoleProgram:
        self.skip_newlines()
        declaration = self.expect(
            "identifier",
            "Le script doit commencer par indicator ou strategy.",
        )
        if declaration.value not in {"indicator", "strategy"}:
            raise AnatoleScriptError(
                "Le script doit commencer par indicator ou strategy.",
                declaration.line,
                declaration.column,
            )
        name_token = self.current
        if name_token.kind not in {"string", "identifier"}:
            raise AnatoleScriptError(
                "Nom du script attendu.",
                name_token.line,
                name_token.column,
            )
        self.advance()
        if self.current.kind not in {"newline", "eof"}:
            raise AnatoleScriptError(
                "Utilise des guillemets pour un nom contenant des espaces.",
                self.current.line,
                self.current.column,
            )
        self.skip_newlines()
        statements: list[Statement] = []
        while self.current.kind != "eof":
            if len(statements) >= MAX_STATEMENTS:
                raise AnatoleScriptError(
                    f"Le script dépasse {MAX_STATEMENTS} instructions.",
                    self.current.line,
                    self.current.column,
                )
            keyword = self.expect("identifier", "Instruction attendue.")
            if keyword.value in {"plot", "enter_long", "exit_long"}:
                wrapped = self.accept("left_paren") is not None
                expression = self.parse_expression()
                if wrapped:
                    self.expect(
                        "right_paren",
                        "Parenthèse fermante attendue après l’instruction.",
                    )
                statements.append(Instruction(
                    kind=keyword.value,
                    expression=expression,
                    line=keyword.line,
                ))
            else:
                variable = keyword.value
                if variable in MARKET_VARIABLES or variable in ALLOWED_FUNCTIONS:
                    raise AnatoleScriptError(
                        f"Nom réservé : {variable}",
                        keyword.line,
                        keyword.column,
                    )
                self.expect("assign", "Signe = attendu après la variable.")
                expression = self.parse_expression()
                self.variables.add(variable)
                statements.append(Assignment(variable, expression, keyword.line))
            if self.current.kind not in {"newline", "eof"}:
                raise AnatoleScriptError(
                    "Fin de ligne attendue.",
                    self.current.line,
                    self.current.column,
                )
            self.skip_newlines()
        return AnatoleProgram(
            kind=declaration.value,
            name=name_token.value,
            statements=tuple(statements),
        )


def parse_script(source: str) -> AnatoleProgram:
    return Parser(tokenize(source)).parse()


def _constant(expression: Expression) -> float:
    if not isinstance(expression, NumberExpression):
        raise AnatoleScriptError(
            "Ce paramètre doit être un nombre constant.",
            expression.line,
            expression.column,
        )
    return expression.value


def _binary(operator: str, left: float, right: float) -> float:
    return float({
        ">": left > right,
        "<": left < right,
        ">=": left >= right,
        "<=": left <= right,
        "==": left == right,
        "!=": left != right,
    }[operator])


class Evaluator:
    def __init__(self, program: AnatoleProgram, candles: list[Candle]) -> None:
        self.program = program
        self.candles = candles
        self.started = monotonic()
        self.environ: dict[str, list[float | None]] = {
            "open": [item.open for item in candles],
            "high": [item.high for item in candles],
            "low": [item.low for item in candles],
            "close": [item.close for item in candles],
            "volume": [float(item.volume) for item in candles],
        }

    def check_runtime(self, expression: Expression) -> None:
        if monotonic() - self.started > MAX_RUNTIME_SECONDS:
            raise AnatoleScriptError(
                "Temps maximal d’exécution dépassé.",
                expression.line,
                expression.column,
            )

    def evaluate(self, expression: Expression) -> list[float | None]:
        self.check_runtime(expression)
        size = len(self.candles)
        if isinstance(expression, NumberExpression):
            return [expression.value] * size
        if isinstance(expression, NameExpression):
            values = self.environ.get(expression.name)
            if values is None:
                raise AnatoleScriptError(
                    f"Variable indisponible : {expression.name}",
                    expression.line,
                    expression.column,
                )
            return values
        if isinstance(expression, BinaryExpression):
            left = self.evaluate(expression.left)
            right = self.evaluate(expression.right)
            return [
                None if a is None or b is None else _binary(
                    expression.operator, a, b
                )
                for a, b in zip(left, right, strict=False)
            ]
        arguments = [self.evaluate(item) for item in expression.arguments]
        name = expression.name
        if name in {"sma", "ema", "rsi", "highest", "lowest"}:
            window = max(1, min(int(_constant(expression.arguments[1])), 500))
            values = arguments[0]
            if name == "sma":
                return sma(values, window)
            if name == "ema":
                return ema(values, window)
            numeric = [float(value or 0) for value in values]
            if name == "rsi":
                return rsi(numeric, window)
            return (
                rolling_highest(numeric, window)
                if name == "highest"
                else rolling_lowest(numeric, window)
            )
        if name == "atr":
            window = max(1, min(int(_constant(expression.arguments[0])), 500))
            return rma(true_range(self.candles), window)
        if name == "macd":
            values = arguments[0]
            fast_period, slow_period, signal_period = 12, 26, 9
            if len(arguments) == 4:
                fast_period = int(_constant(expression.arguments[1]))
                slow_period = int(_constant(expression.arguments[2]))
                signal_period = int(_constant(expression.arguments[3]))
            fast = ema(values, fast_period)
            slow = ema(values, slow_period)
            line = [
                left - right
                if left is not None and right is not None
                else None
                for left, right in zip(fast, slow, strict=False)
            ]
            # Calculer le signal garantit que les paramètres sont bornés et
            # laisse le moteur extensible sans exposer un tuple implicite.
            ema(line, signal_period)
            return line
        if name in {"crossover", "crossunder"}:
            left, right = arguments
            output: list[float | None] = [0.0] * size
            for index in range(1, size):
                current_left, current_right = left[index], right[index]
                prior_left, prior_right = left[index - 1], right[index - 1]
                if None in {
                    current_left, current_right, prior_left, prior_right
                }:
                    continue
                if name == "crossover":
                    output[index] = float(
                        prior_left <= prior_right
                        and current_left > current_right
                    )
                else:
                    output[index] = float(
                        prior_left >= prior_right
                        and current_left < current_right
                    )
            return output
        raise AnatoleScriptError(
            f"Fonction non exécutable : {name}",
            expression.line,
            expression.column,
        )

    def compile(self) -> CompiledScript:
        enter = [False] * len(self.candles)
        exit_ = [False] * len(self.candles)
        plots: dict[str, list[float | None]] = {}
        for statement in self.program.statements:
            if isinstance(statement, Assignment):
                self.environ[statement.name] = self.evaluate(statement.expression)
                continue
            values = self.evaluate(statement.expression)
            if statement.kind == "plot":
                name = (
                    statement.expression.name
                    if isinstance(statement.expression, NameExpression)
                    else f"plot_{len(plots) + 1}"
                )
                plots[name] = values
            elif statement.kind == "enter_long":
                enter = [bool(value) for value in values]
            elif statement.kind == "exit_long":
                exit_ = [bool(value) for value in values]
        return CompiledScript(
            program=self.program,
            enter_long=enter,
            exit_long=exit_,
            plots=plots,
        )


def compile_script(source: str, candles: list[Candle]) -> CompiledScript:
    return Evaluator(parse_script(source), candles).compile()


def validate_script(source: str) -> AnatoleScriptValidation:
    try:
        tokens = tokenize(source)
        parser = Parser(tokens)
        program = parser.parse()
        plots = [
            statement.expression.name
            if isinstance(statement, Instruction)
            and statement.kind == "plot"
            and isinstance(statement.expression, NameExpression)
            else f"plot_{index + 1}"
            for index, statement in enumerate(program.statements)
            if isinstance(statement, Instruction) and statement.kind == "plot"
        ]
        return AnatoleScriptValidation(
            valid=True,
            name=program.name,
            kind=program.kind,
            statements_count=len(program.statements),
            indicators_count=parser.indicators,
            plots=plots,
        )
    except AnatoleScriptError as exc:
        return AnatoleScriptValidation(
            valid=False,
            diagnostics=[exc.diagnostic()],
        )
