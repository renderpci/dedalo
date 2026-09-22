---
description: Analyze and document a PHP class file, adding or updating DocBlocks for the class and its methods.
---

1. **Read File**: Read the content of the target PHP class file.
2. **Analyze Content**: Examine the class structure, properties, and methods. Understand the logic, parameters, and return types.
3. **Generate Documentation**:
    - **Class DocBlock**: Create a detailed class-level DocBlock explaining the component's purpose, usage, key functionalities, and data model.
    - **Method DocBlocks**: For each method, create or update the DocBlock.
        - **Description**: Clear explanation of what the method does.
        - **Parameters**: `@param type $name Description`
        - **Return**: `@return type Description`
        - **Throws**: `@throws ExceptionType Description` (if applicable)
4. **Apply Updates**: Use `replace_file_content` or `multi_replace_file_content` to insert the new documentation into the file. ensure to preserve existing code logic.