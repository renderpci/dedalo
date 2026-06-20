# Using media components

> See also: [Media pipeline](media_pipeline.md) · [Service Upload](services/service_upload.md) · [Locator](../core/locator.md)

## Introduction

Media components manage files such as images, audiovisuals, PDFs and SVGs. When you need to upload a media file from a tool, or extend a component, it is easier to reuse a media component's built-in functionality — load the file, process it on the server, save it to a section, and so on — than to build a new process of your own.

## Example

This example shows how to use the Dédalo work API to upload a new image, store it, and reuse the uploaded image in other Dédalo parts or components.

Overview:

1. Import necessary tools
2. Upload process:
    1. Create new section for the image
    2. Store the new section as my_image_data to be used to get the image
    3. Create new component_image
    4. Open the tool_upload interface
3. Load a previously uploaded image:
    1. Get `my_image_data`
    2. Create a `component_image` from `my_image_data`
    3. Get the URL of the quality you want

Step by step:

1. First, import some common methods:

    ```javascript
    // necessary imports
        import {data_manager} from '../../common/js/data_manager.js'
        import {get_instance} from '../../common/js/instances.js'
        import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
    ```

2. Next, create the image section and store it in the database. In your code, the result of creating the new section — a [locator](../core/locator.md) — must be stored in your own data schema; you use that locator to read the image whenever you need it.

    !!! note "Storing locator data in your tool's data schema"
        The locator is an object, and you use it to re-create the component and the media section. Consider whether you need to store multiple images as an array of locators.

    ```javascript
    // create new section for the image, it will create new record in the database.
    // the result will be the data to stored into ...
    // DD_TIPOS object has the most common media sections, in this case we using the image section and component, but it's possible to use the ontology tipo or other sections.
    const image_section_tipo    = DD_TIPOS.DEDALO_SECTION_RESOURCES_IMAGE_TIPO // 'rsc170'
    const component_image_tipo  = DD_TIPOS.DEDALO_COMPONENT_RESOURCES_IMAGE_TIPO //'rsc29'

    // create API call as rqo (request query object), with the action to create new section
    const rqo = {
        action  : 'create',
        source  : {
            section_tipo : image_section_tipo
        }
    }
    // call to API
    const api_response = await data_manager.request({
        body : rqo
    })

    // if the API result is ok go ahead
    if (api_response.result && api_response.result>0) {
        // section_id of the new record
        const section_id = api_response.result

        // data to be stored into ...., it will be used to load the image
        // the storage could be an array of images objects as:
        const to_stored_image_data = [{
            section_tipo    : image_section_tipo,
            section_id      : section_id,
            component_tipo  : component_image_tipo
        }]

        // To create the new image instance with the result data of uploaded process and build it.
        const component_image = await get_instance({
            model           : 'component_image',
            mode            : 'edit',
            tipo            : component_image_tipo,
            section_tipo    : image_section_tipo,
            section_id      : section_id
        })
        await component_image.build(true)// Note the 'await' here to indicate that this process need to be complete before continue, you can create a promise or do it inside a async function... as you want!

        // get the upload tool to be fired
        const tool_upload = component_image.tools.find(el => el.model === 'tool_upload')

        // open_tool, it will be the interface to upload data in new window.
            open_tool({
                tool_context    : tool_upload,
                caller          : component_image
            })

        // done!
    }
    ```

3. To load a previously uploaded image.

    Retrieve the data you stored during the upload step. First, obtain one locator from the stored array in your data schema, in whatever way suits you — a `for` loop, `Array.find`, and so on.

    ```javascript
    // NOTE: this variable is used to show the locator data and to understand the next code.
    // It need to be the specific locator object to be loaded.
    const stored_image_data_item = {
        section_tipo    : image_section_tipo,
        section_id      : section_id,
        component_tipo  : component_image_tipo
    }

    // create the new image instance and build it with the data stored
    const component_image = await get_instance({
        model           : 'component_image',
        mode            : 'edit',
        tipo            : stored_image_data_item.component_tipo,
        section_tipo    : stored_image_data_item.section_tipo,
        section_id      : stored_image_data_item.section_id,
    })
    await component_image.build(true)// Note the await here to indicate that this process need to be complete before continue, you can create a promise or do it inside a async function... as you want

    // Get the quality of the image, it could be default_quality, but maybe original_quality would be better here... ???
    // Maybe is possible add a quality selector to be decided by user.
    const file_info_default_quality = component_image.data.value[0]?.files_info.find(el => el.quality===component_image.context.features.default_quality && el.file_exist===true)

    // so the url of the image to use will be: (don't forget to check if the uri exist!)
    const url = file_info_default_quality
        ? DEDALO_MEDIA_URL + file_info_default_quality.file_path
        : null

    ```
