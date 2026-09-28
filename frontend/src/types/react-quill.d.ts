declare module 'react-quill' {
  import * as React from 'react';
  
  export interface ReactQuillProps {
    value?: string;
    defaultValue?: string;
    readOnly?: boolean;
    theme?: string;
    modules?: any;
    formats?: string[];
    bounds?: string | HTMLElement;
    placeholder?: string;
    preserveWhitespace?: boolean;
    className?: string;
    onChange?: (content: string, delta: any, source: string, editor: any) => void;
    onChangeSelection?: (selection: any, source: string, editor: any) => void;
    onFocus?: (selection: any, source: string, editor: any) => void;
    onBlur?: (previousSelection: any, source: string, editor: any) => void;
    onKeyDown?: React.EventHandler<any>;
    onKeyPress?: React.EventHandler<any>;
    onKeyUp?: React.EventHandler<any>;
    id?: string;
  }

  export default class ReactQuill extends React.Component<ReactQuillProps> {
    focus(): void;
    blur(): void;
    getEditor(): any;
  }
}
