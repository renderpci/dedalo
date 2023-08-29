# component_date

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal": true,
    "is_related": false,
    "is_media": false,
    "modes": ["edit","list","tm","search"],
    "default_tools" : [
        "tool_time_machine", 
        "tool_replace_component_data", 
        "tool_add_component_data"
    ],
    "render_views" :[
        {
            "view"    : "mini | default",
            "mode"    : "edit | list"
        },
        {
            "view"    : "line | print",
            "mode"    : "edit"
        },       
        {
            "view"    : "text",
            "mode"    : "list"
        }
    ],
    "data": "object",
    "sample_data": {
        "lg-nolan": [
            {
                "mode":"range",
                "start" : {
                    "year": 2012,
                    "month": 11,
                    "day": 7,
                    "hour": 17,
                    "minute": 33,
                    "second": 49
                },
                "end" : {
                    "year": 2012,
                    "month": 12,
                    "day": 8,
                    "hour": 22,
                    "minute": 15,
                    "second": 35
                }
            },
            {
                "mode":"range",
                "start":
                    {
                        "time":10349337600,
                        "year":322
                    }
            }
        ]
    },
    "value": "array of numbers",
    "sample_value": [{
        "start" : {
            "year": -350
        }
    }]
}
```

## Definition

Component date manage any kind of dates in different modes. Data is non translatable and use `lg-nolan` to define his language.

The component has 4 different modes:

- **date**: with start date only
- **range**: with start date and end date
- **period**: with year, moth, day, hour, minute, second, millisecond
- **time**: with hour, minute, second, millisecond

## Data model

**Data:** `object` with `lg-nolan` as property.

**Value:** `array` of `objects`, or `null`

**Storage:** In database component date save his data as object with `lg-nolan` as property and values as array of objects.

**Modes supported:** date | range | period | time

**Default mode:** date

**Definition:**

object has the possibility to use:

- start (optional object): indicate the initial date
- end  (optional object): indicate the termination date
- period (optional object): indicate a period of time indicated a range of time.

properties of the dd_date:

- year (number): A year.
- month (optional number): A month, ranging between 1 and 12 inclusive.
- day ( optional number): A day of the month, ranging between 1 and 31 inclusive, 1 - 30 in moths with 30 days, 1 - 28 in February or 1 - 29 in leap years.
- hour (optional number): An hour of the day, ranging between 0 and 23 inclusive.
- minute (optional number): A minute, ranging between 0 and 59 inclusive.
- second (optional number): A second, ranging between 0 and 59 inclusive.
- millisecond (optional number): A number of milliseconds, ranging between 0 and 999 inclusive.
- time (number): A unique time representation of the date. It's calculated when the date is created or modifier.

Example of date: A punctual date 2012-11-07

```json
[{
   "start" : {
        "year": 2012,
        "month": 11,
        "day": 7
    }
}]
```

Example of range. A time lapse form 2012-11-07 17:33:49 to 2012-12-08

```json
[{
    "start" : {
        "year": 2012,
        "month": 11,
        "day": 7,
        "hour": 17,
        "minute": 33,
        "second": 49
    },
    "end" : {
        "year": 2012,
        "month": 12,
        "day": 8,
    }
}]
```

Example of date: Year -238

```json
[{
   "start" : {
        "year": -238
    }
}]
```

Example of date: month 10 of the year 1238

```json
[{
   "start" : {
        "year": 1238,
        "month": 10
    }
}]
```

Example of period. A lapse time of 3 years and 10 moths

```json
[{
    "mode": "period",
    "period": {
        "year": 3,
        "month": 10,
    }
}]
```

Example of time. A punctual time 17:33:49

```json
[{
   "start" : {
        "hour": 17,
        "minute": 33,
        "second": 49
    }
}]
```

Component date use a dd_date object definition to create time base objects. Component data can handle objects with only one property assigned.

When the component is instantiated, the component get his data from his section and only get the value without lang.

## Import model

By default import model use the JSON format of his value, as the component do not use languages the main format to import is the array of dd_date objects.

```json
[{
   "start" : {
        "year": 1238,
        "month": 10,
        "day": 9
    }
}]
```

As Dédalo import use a csv without format, JSON data need to be stringified in this way:

The table to import

| section_id    | tch56     |
| ------------  | :--------------: |
| 1             | \[{"start":{"year":1238,"month":10,"day":9}}]   |

Will be encoded in csv format as:

```csv
section_id;tch56
1;"[{""start"":{""year"":1238,""month"":10,""day"":9}}]"
```

Alternative forms to import:

1. A punctual date in flat string :

    ```json
    -205/05
    ```

    Example:

    section_id   | tch56
    ------------ | :--------------:
    1            | -205/05

    It's allowed to use different [formats](#using-other-date-formats) indicating it in the name of the header as tch56_dmy.

    section_id   | tch56_dmy
    ------------ | :--------------:
    1            | 05/-205

    It's allowed to use different separator between [values of elements](#using-other-separators).

    ```json
    -205-05
    15-11--50
    15.11.-50
    ```
    


2. A range of dates in flat string:

     ```json
    2023/10/26<>2023/10/27
    ```

    The '<>' separator indicate the range with the start date at left and end date at right.

    ```json
    [{
        "start" : {
            "year": 2023,
            "month": 10,
            "day": 26
        },
        "end" : {
            "year": 2023,
            "month": 10,
            "day": 27
        }
    }]
    ```

    Is possible to leave spaces between dates and the separator.

     ```json
    -150 <>      238
    ```

    Is a valid range date, but the separator will be always in same format, a space between marks are not allowed:

     ```json
    -150< >238
    ```

    it's not a valid range.

    It's allowed to use different [formats](#using-other-date-formats) indicating it in the name of the header as tch56_dmy.

    section_id   | tch56_mdy
    ------------ | :--------------:
    1            | 10/26/2023<>10/27/2023

     It's allowed to use different separator between [values of elements](#using-other-separators).

    ```json
    10-26-2023<>10-27-2023
    10.26.2023<>10.27.2023
    ```

3. Multi value date in flat string

    ```json
    2023/10/26|1853/02/18
    ```

    The '|' separator indicate multiple values. The values are not a star <> end dates, both are start dates, the second one is the start date of the second value.

    The previous string date will be parse as:

     ```json
    [
        {
            "start" : {
                "year": 2023,
                "month": 10,
                "day": 26
            }
        },
        {
            "start" : {
                "year": 1853,
                "month": 02,
                "day": 18
            }
        }
    ]
    ```

    Is possible to leave spaces between dates and the separator.

    ```json
    -150 |          -25
    ```

    It's allowed to use different [formats](#using-other-date-formats) indicating it in the name of the header as tch56_dmy.

    section_id   | tch56_mdy
    ------------ | :--------------:
    1            | 10/26/2023\|02/18/1853

    It's allowed to use different separator between [values of elements](#using-other-separators).

    ```json
    10-26-2023\|02-18-1853
    10.26.2023\|02.18.1853
    ```

4. Combination of multi value and range

    ```json
    2023/10/26<>2023/10/27|1853/02/18
    ```

    To define multiple values with ranges is possible to use a combination of the '|' to indicate the multi value and the '<>' to indicate the range.

     The previous string date will be parse as two date values with the range of the first value with star and end dates:

     ```json
    [
        {
            "start" : {
                "year": 2023,
                "month": 10,
                "day": 26
            },
            "end" : {
                "year": 2023,
                "month": 10,
                "day": 27
            }
        },
        {
            "start" : {
                "year": 1853,
                "month": 02,
                "day": 18
            }
        }
    ]
    ```

    Is possible leave a part of the range blank:

     ```json
    2023/10/26|<>1853/02/18
    ```

     ```json
    [
        {
            "start" : {
                "year": 2023,
                "month": 10,
                "day": 26
            }
        },
        {
            "end" : {
                "year": 1853,
                "month": 02,
                "day": 18
            }
        }
    ]
    ```

    Is possible to leave spaces between dates and the separators.

    ```json
    2023/10/26 |   <>  1853/02/18
    ```

    It's allowed to use different [formats](#using-other-date-formats) indicating it in the name of the header as tch56_dmy.

    section_id   | tch56_mdy
    ------------ | :--------------:
    1            | 10/26/2023\|<>02/18/1853

    It's allowed to use different separator between [values of elements](#using-other-separators).

    ```json
    10-26-2023\|<>02-18-1853
    10.26.2023\|<>02.18.1853

### Using other date formats

By default the string date formats use \[-]y/m/d, but its possible to import the date in other formats indicating in the column header the format as second parameter after the tipo, using the '_' as character between them.

section_id   | tch56_dmy
------------ | :--------------:
1            | 05/-205

Is possible to use this formats

Format | Description
--- | ---
ymd | year/moth/day as 2023/10/26
mdy | moth/day/year as 10/26/2023
dmy | day/moth/year as 26/10/2023

### Using other separators

Default separator between day moth and year is `/` but is possible to use `-` and `.`

```json
20-10-1945
2023-10-26|<>1853-02-18
-200<>50-11|-150-10
11-12--200|28-10-5
```

```json
20.10.1945
2023.10.26|<>1853.02.18
-200<>50.11|-150.10
11.12.-200|28.10.5
```

## Properties

`date_mode`

options: date | range | period | time

Defines the type of date to be use. By default component_date set a `date` mode

Example to set a range:

```json
{
    "date_mode" : "range"
}
```

`fields_separator`

Used to define the character/s to be used between date ranges. Used to export, and show data inside other components.

Example:

```json
{
    "fields_separator": " <> "
}
```

Will join text version of the date: -200 <> 50/11

`records_separator`

Used to define the character to be used between multiple values of the component.

Example:

```json
{
    "fields_separator": " | "
}
```

Will join locators (records) as text in this way: 26/10/2023 | 18/11/2000

`mandatory`

options: true | false

Inform to users that this component need a data value (user need to introduce any value, it's mandatory).
