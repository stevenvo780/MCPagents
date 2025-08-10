// Test file para probar Language Model Tools con Agent Mode
// Este archivo tiene errores intencionales para que Copilot los detecte

function calculateSum(a, b) {
    // Error 1: No hay validación de tipos
    return a + b;
}

// Error 2: Variable no utilizada
const unusedVariable = 42;

// Error 3: Función sin documentación
function complexCalculation(x, y, z) {
    return (x * y) + (z / 2) - Math.sqrt(x);
}

// Error 4: Console.log que debería ser eliminado
console.log("Debug message that should be removed");

// Error 5: Código duplicado
function addNumbers(num1, num2) {
    return num1 + num2;
}

function sumTwoNumbers(first, second) {
    return first + second;
}

// Error 6: Magic numbers
function calculateInterest(principal) {
    return principal * 0.05 * 12;
}

export { calculateSum, complexCalculation, addNumbers, sumTwoNumbers, calculateInterest };
