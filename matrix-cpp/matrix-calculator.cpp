#include <algorithm>
#include <cmath>
#include <cstdio>
#include <stdexcept>
#include <utility>
#include <vector>

using Matrix = std::vector<std::vector<double>>;
using Size = std::pair<std::size_t, std::size_t>;

Size dimensions(const Matrix& matrix) {
    if (matrix.empty()) throw std::runtime_error("Expected a nonempty matrix");
    const auto columns = matrix.front().size();
    for (const auto& row : matrix) {
        if (row.empty()) throw std::runtime_error("Expected a nonempty row");
        if (row.size() != columns) throw std::runtime_error("Rows must have equal lengths");
        for (double value : row)
            if (!std::isfinite(value)) throw std::runtime_error("Matrix entries must be finite numbers");
    }
    return {matrix.size(), columns};
}

Matrix zeros(std::size_t rows, std::size_t columns) {
    return Matrix(rows, std::vector<double>(columns, 0));
}

Matrix add(const Matrix& left, const Matrix& right, double sign) {
    const auto a = dimensions(left);
    const auto b = dimensions(right);
    if (a != b) throw std::runtime_error("Addition requires equal dimensions");
    auto result = zeros(a.first, a.second);
    for (std::size_t row = 0; row < a.first; ++row)
        for (std::size_t column = 0; column < a.second; ++column)
            result[row][column] = left[row][column] + sign * right[row][column];
    return result;
}

Matrix multiply(const Matrix& left, const Matrix& right) {
    const auto a = dimensions(left);
    const auto b = dimensions(right);
    if (a.second != b.first) throw std::runtime_error("Multiplication requires A columns = B rows");
    auto result = zeros(a.first, b.second);
    for (std::size_t row = 0; row < a.first; ++row)
        for (std::size_t column = 0; column < b.second; ++column)
            for (std::size_t k = 0; k < a.second; ++k)
                result[row][column] += left[row][k] * right[k][column];
    return result;
}

Matrix transpose(const Matrix& matrix) {
    const auto size = dimensions(matrix);
    auto result = zeros(size.second, size.first);
    for (std::size_t row = 0; row < size.first; ++row)
        for (std::size_t column = 0; column < size.second; ++column)
            result[column][row] = matrix[row][column];
    return result;
}

struct Elimination {
    double determinant;
    Matrix inverse; // Empty when singular at the chosen tolerance.
};

// Same partial-pivot Gauss-Jordan algorithm and tolerance as the JS example.
Elimination eliminate(const Matrix& matrix) {
    const auto size = dimensions(matrix);
    const auto n = size.first;
    if (n != size.second) throw std::runtime_error("Determinant and inverse require a square matrix");
    auto work = matrix;
    auto inverse = zeros(n, n);
    double scale = 0;
    for (std::size_t row = 0; row < n; ++row) {
        inverse[row][row] = 1;
        for (std::size_t column = 0; column < n; ++column)
            scale = std::max(scale, std::abs(matrix[row][column]));
    }
    const double tolerance = scale * 1e-12;
    double determinant = 1;
    for (std::size_t column = 0; column < n; ++column) {
        auto pivotRow = column;
        for (auto row = column + 1; row < n; ++row)
            if (std::abs(work[row][column]) > std::abs(work[pivotRow][column])) pivotRow = row;
        if (std::abs(work[pivotRow][column]) <= tolerance) return {0, {}};
        if (pivotRow != column) {
            std::swap(work[column], work[pivotRow]);
            std::swap(inverse[column], inverse[pivotRow]);
            determinant = -determinant;
        }
        const double pivot = work[column][column];
        determinant *= pivot;
        for (std::size_t k = 0; k < n; ++k) {
            work[column][k] /= pivot;
            inverse[column][k] /= pivot;
        }
        for (std::size_t row = 0; row < n; ++row) {
            if (row != column) {
                const double factor = work[row][column];
                for (std::size_t k = 0; k < n; ++k) {
                    work[row][k] -= factor * work[column][k];
                    inverse[row][k] -= factor * inverse[column][k];
                }
            }
        }
    }
    return {determinant, std::move(inverse)};
}

void printMatrix(const char* title, const Matrix& matrix) {
    std::puts(title);
    for (const auto& row : matrix) {
        for (std::size_t column = 0; column < row.size(); ++column)
            std::printf("%s%.17g", column == 0 ? "" : "  ", row[column]);
        std::putchar('\n');
    }
}

int main() {
    // Edit the matrices here and rebuild.
    const Matrix A = {{2, 1}, {1, 1}};
    const Matrix B = {{3, 4}, {5, 6}};
    try {
        printMatrix("A:", A);
        printMatrix("B:", B);
        printMatrix("Transpose A:", transpose(A));
    } catch (const std::exception& error) {
        std::printf("Input error: %s\n", error.what());
    }
    try {
        printMatrix("A + B:", add(A, B, 1));
        printMatrix("A - B:", add(A, B, -1));
    } catch (const std::exception& error) {
        std::printf("Addition/subtraction: %s\n", error.what());
    }
    try {
        printMatrix("A * B:", multiply(A, B));
    } catch (const std::exception& error) {
        std::printf("Multiplication: %s\n", error.what());
    }
    try {
        const auto result = eliminate(A);
        std::printf("Determinant A: %.17g\n", result.determinant);
        if (result.inverse.empty()) {
            std::puts("Inverse A: singular or too close to singular at the chosen tolerance");
        } else {
            printMatrix("Inverse A:", result.inverse);
            printMatrix("A * inverse(A):", multiply(A, result.inverse));
        }
    } catch (const std::exception& error) {
        std::printf("Determinant/inverse: %s\n", error.what());
    }
}
