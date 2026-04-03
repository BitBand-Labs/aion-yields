import { use, Assertion } from "chai";
// @ts-ignore
import chaiAsPromised from "chai-as-promised";

use(chaiAsPromised);

// Patch equal/gt to handle BigInt vs number comparisons
Assertion.overwriteMethod("equal", function (_super: Function) {
    return function (this: any, expected: any, msg?: string) {
        const actual = (this as any).__flags?.object ?? this._obj;
        if (typeof actual === "bigint" && typeof expected === "number") {
            return _super.call(this, BigInt(expected), msg);
        }
        return _super.call(this, expected, msg);
    };
});

Assertion.overwriteMethod("above", function (_super: Function) {
    return function (this: any, expected: any, msg?: string) {
        const actual = (this as any).__flags?.object ?? this._obj;
        if (typeof actual === "bigint" && typeof expected === "number") {
            return _super.call(this, BigInt(expected), msg);
        }
        return _super.call(this, expected, msg);
    };
});

// Add "reverted" as a chai property (async assertion that the promise rejects)
Assertion.addProperty("reverted", function (this: any) {
    const promise = this._obj;
    const isNegated = (this as any).__flags?.negate ?? false;

    const derivedPromise = promise.then(
        () => {
            if (!isNegated) {
                throw new Error("Expected transaction to be reverted");
            }
        },
        (err: any) => {
            if (isNegated) {
                throw new Error(`Expected transaction NOT to be reverted, but it reverted with: ${err.message}`);
            }
        }
    );

    this.then = derivedPromise.then.bind(derivedPromise);
    this.catch = derivedPromise.catch.bind(derivedPromise);
    return this;
});

// Add "revertedWith" method (check revert reason string)
Assertion.addMethod("revertedWith", function (this: any, expectedMessage: string) {
    const promise = this._obj;

    const derivedPromise = promise.then(
        () => {
            throw new Error(`Expected transaction to be reverted with "${expectedMessage}", but it succeeded`);
        },
        (err: any) => {
            const errMsg = err.message || err.toString();
            if (!errMsg.includes(expectedMessage)) {
                throw new Error(
                    `Expected transaction to be reverted with "${expectedMessage}", but got: ${errMsg}`
                );
            }
        }
    );

    this.then = derivedPromise.then.bind(derivedPromise);
    this.catch = derivedPromise.catch.bind(derivedPromise);
    return this;
});

// Add "revertedWithCustomError" method
Assertion.addMethod("revertedWithCustomError", function (this: any, contract: any, errorName: string) {
    const promise = this._obj;

    const derivedPromise = promise.then(
        () => {
            throw new Error(`Expected transaction to be reverted with custom error "${errorName}", but it succeeded`);
        },
        (err: any) => {
            const errMsg = err.message || err.toString();
            if (!errMsg.includes(errorName)) {
                throw new Error(
                    `Expected custom error "${errorName}", but got: ${errMsg}`
                );
            }
        }
    );

    this.then = derivedPromise.then.bind(derivedPromise);
    this.catch = derivedPromise.catch.bind(derivedPromise);
    return this;
});

export {};
