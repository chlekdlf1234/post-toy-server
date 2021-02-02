import { UserInput } from "../resolvers/UserInput"

export const validateRegister = (userInput: UserInput) => {
    if (!userInput.email.includes('@')) {
        return [
            {
                field: "email",
                message: "email must includes @"
            }
        ]
    }

    if (userInput.username.length <= 2) {
        return [
            {
                field: "username",
                message: "length must be greater than 2"
            }
        ]
    }

    return null
}