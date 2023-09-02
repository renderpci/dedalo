<?php

/**
 * Rails Style html tag helpers
 *
 * These are used by the other examples to make the code
 * more concise and simpler to read.
 *
 * @copyright  Copyright (c) 2009-2013 Nicholas J Humfrey
 * @license    http://unlicense.org/
 */

/* Examples:

echo content_tag('p','Paragraph Tag', array('class'=>'foo'));

echo tag('br');
echo link_to('Hyperlink', 'http://www.example.com/?a=1&b=2');
echo tag('br');

echo form_tag();

  echo label_tag('first_name').text_field_tag('first_name', 'Joe').tag('br');
  echo label_tag('password').password_field_tag().tag('br');

  echo label_tag('radio1_value1', 'Radio 1').radio_button_tag('radio1', 'value1').tag('br');
  echo label_tag('radio1_value2', 'Radio 2').radio_button_tag('radio1', 'value2', true).tag('br');
  echo label_tag('radio1_value3', 'Radio 3').radio_button_tag('radio1', 'value3').tag('br');

  echo label_tag('check1', 'Check 1').check_box_tag('check1', 'value1').tag('br');
  echo label_tag('check2', 'Check 2').check_box_tag('check2', 'value2', true).tag('br');
  echo label_tag('check3', 'Check 3').check_box_tag('check3', 'value3').tag('br');

  $options = array('Label 1' => 'value1', 'Label 2' => 'value2', 'Label 3' => 'value3');
  echo label_tag('select1', 'Select Something:');
  echo select_tag('select1', $options, 'value2').tag('br');

  echo label_tag('textarea1', 'Type Something:');
  echo text_area_tag('textarea1', "Hello World!").tag('br');

  echo submit_tag();

echo form_end_tag();

*/

function tag_options($options)
{
    $html = '';
    foreach ($options as $key => $value) {
        if ($key && $value) {
            $html .= ' '.htmlspecialchars($key).'="'.
                         htmlspecialchars($value).'"';
        }
    }

    return $html;
}

function tag($name, $options = [], $open = false)
{
    return "<$name".tag_options($options).($open ? '>' : ' />');
}

function content_tag($name, $content = null, $options = [])
{
    return "<$name".tag_options($options).'>'.
           htmlspecialchars($content ?? '')."</$name>";
}

function link_to($text, $uri = null, $options = [])
{
    if (null == $uri) {
        $uri = $text;
    }
    $options = array_merge(['href' => $uri], $options);

    return content_tag('a', $text, $options);
}

function link_to_self($text, $query_string, $options = [])
{
    return link_to($text, $_SERVER['PHP_SELF'].'?'.$query_string, $options);
}

function image_tag($src, $options = [])
{
    $options = array_merge(['src' => $src], $options);

    return tag('img', $options);
}

function input_tag($type, $name, $value = null, $options = [])
{
    $options = array_merge(
        [
            'type' => $type,
            'name' => $name,
            'id' => $name,
            'value' => $value,
        ],
        $options
    );

    return tag('input', $options);
}

function text_field_tag($name, $default = null, $options = [])
{
    $value = isset($_REQUEST[$name]) ? $_REQUEST[$name] : $default;

    return input_tag('text', $name, $value, $options);
}

function text_area_tag($name, $default = null, $options = [])
{
    $content = isset($_REQUEST[$name]) ? $_REQUEST[$name] : $default;
    $options = array_merge(
        [
            'name' => $name,
            'id' => $name,
            'cols' => 60,
            'rows' => 5,
        ],
        $options
    );

    return content_tag('textarea', $content, $options);
}

function hidden_field_tag($name, $default = null, $options = [])
{
    $value = isset($_REQUEST[$name]) ? $_REQUEST[$name] : $default;

    return input_tag('hidden', $name, $value, $options);
}

function password_field_tag($name = 'password', $default = null, $options = [])
{
    $value = isset($_REQUEST[$name]) ? $_REQUEST[$name] : $default;

    return input_tag('password', $name, $value, $options);
}

function radio_button_tag($name, $value, $default = false, $options = [])
{
    if ((isset($_REQUEST[$name]) && $_REQUEST[$name] == $value)
        || (!isset($_REQUEST[$name]) && $default)) {
        $options = array_merge(['checked' => 'checked'], $options);
    }
    $options = array_merge(['id' => $name.'_'.$value], $options);

    return input_tag('radio', $name, $value, $options);
}

function check_box_tag($name, $value = '1', $default = false, $options = [])
{
    if ((isset($_REQUEST[$name]) && $_REQUEST[$name] == $value)
        || (!isset($_REQUEST['submit']) && $default)) {
        $options = array_merge(['checked' => 'checked'], $options);
    }

    return input_tag('checkbox', $name, $value, $options);
}

function submit_tag($name = '', $value = 'Submit', $options = [])
{
    return input_tag('submit', $name, $value, $options);
}

function reset_tag($name = '', $value = 'Reset', $options = [])
{
    return input_tag('reset', $name, $value, $options);
}

function label_tag($name, $text = null, $options = [])
{
    if (null == $text) {
        $text = ucwords(str_replace('_', ' ', $name)).': ';
    }
    $options = array_merge(
        ['for' => $name, 'id' => "label_for_$name"],
        $options
    );

    return content_tag('label', $text, $options);
}

function labeled_text_field_tag($name, $default = null, $options = [])
{
    return label_tag($name).text_field_tag($name, $default, $options);
}

function select_tag($name, $options, $default = null, $html_options = [])
{
    $opts = '';
    foreach ($options as $key => $value) {
        $arr = ['value' => $value];
        if ((isset($_REQUEST[$name]) && $_REQUEST[$name] == $value)
            || (!isset($_REQUEST[$name]) && $default == $value)) {
            $arr = array_merge(['selected' => 'selected'], $arr);
        }
        $opts .= content_tag('option', $key, $arr);
    }
    $html_options = array_merge(
        ['name' => $name, 'id' => $name],
        $html_options
    );

    return '<select'.tag_options($html_options).">$opts</select>";
}

function form_tag($uri = null, $options = [])
{
    if (null == $uri) {
        $uri = $_SERVER['PHP_SELF'];
    }
    $options = array_merge(
        ['method' => 'get', 'action' => $uri],
        $options
    );

    return tag('form', $options, true);
}

function form_end_tag()
{
    return '</form>';
}
