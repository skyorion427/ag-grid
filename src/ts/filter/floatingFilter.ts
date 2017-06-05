import {Autowired} from "../context/context";
import {SerializedTextFilter} from "./textFilter";
import {DateFilter, SerializedDateFilter} from "./dateFilter";
import {SerializedNumberFilter} from "./numberFilter";
import {IComponent} from "../interfaces/iComponent";
import {RefSelector} from "../widgets/componentAnnotations";
import {_} from "../utils";
import {IDateComp, IDateParams} from "../rendering/dateComponent";
import {ComponentProvider} from "../componentProvider";
import {Component} from "../widgets/component";
import {Constants} from "../constants";
import {Column} from "../entities/column";

export interface FloatingFilterChange{
}

export interface IFloatingFilterParams<M, F extends FloatingFilterChange> {
    column:Column,
    onFloatingFilterChanged:(change:F|M)=>void;
    currentParentModel:()=>M;
    suppressFilterButton: boolean;
    debounceMs?:number;
}

export interface IFloatingFilter<M, F extends FloatingFilterChange, P extends IFloatingFilterParams<M, F>>{
    onParentModelChanged(parentModel:M):void;
}

export interface IFloatingFilterComp<M, F extends FloatingFilterChange, P extends IFloatingFilterParams<M, F>> extends IFloatingFilter<M, F, P>, IComponent<P> {}

export interface BaseFloatingFilterChange<M> extends FloatingFilterChange{
    model:M
    apply:boolean
}

export abstract class InputTextFloatingFilterComp<M, P extends IFloatingFilterParams<M, BaseFloatingFilterChange<M>>> extends Component implements IFloatingFilter <M, BaseFloatingFilterChange<M>, P>{
    @RefSelector('eColumnFloatingFilter')
    eColumnFloatingFilter: HTMLInputElement;

    onFloatingFilterChanged:(change:BaseFloatingFilterChange<M>)=>void;
    currentParentModel:()=>M;
    lastKnownModel:M = null;

    constructor(){
        super(`<div><input  ref="eColumnFloatingFilter" class="ag-floating-filter-input"></div>`)
    }

    init (params:P):void{
        this.onFloatingFilterChanged = params.onFloatingFilterChanged;
        this.currentParentModel = params.currentParentModel;
        let debounceMs: number = params.debounceMs != null ? params.debounceMs : 500;
        let toDebounce:()=>void = _.debounce(this.syncUpWithParentFilter.bind(this), debounceMs);
        this.addDestroyableEventListener(this.eColumnFloatingFilter, 'input', toDebounce);
        this.addDestroyableEventListener(this.eColumnFloatingFilter, 'keypress', toDebounce);
        let columnDef = (<any>params.column.getDefinition());
        if (columnDef.filterParams && columnDef.filterParams.filterOptions && columnDef.filterParams.filterOptions.length === 1 && columnDef.filterParams.filterOptions[0] === 'inRange'){
            this.eColumnFloatingFilter.readOnly = true;
        }
    }

    abstract asParentModel ():M;
    abstract asFloatingFilterText (parentModel:M):string;

    onParentModelChanged(parentModel:M):void{
        if (this.equalModels(this.lastKnownModel, parentModel)) return;
        this.eColumnFloatingFilter.value = this.asFloatingFilterText (parentModel);
        this.lastKnownModel = parentModel;
    }

    syncUpWithParentFilter (e:KeyboardEvent):void{
        let model = this.asParentModel();
        if (this.equalModels(this.lastKnownModel, model)) return;

        this.lastKnownModel = model;
        if (_.isKeyPressed(e, Constants.KEY_ENTER)) {
            this.onFloatingFilterChanged({
                model: model,
                apply: true
            });
        } else {
            this.onFloatingFilterChanged({
                model: model,
                apply: false
            });
        }
    }

    equalModels (left:any, right:any):boolean{
        if (_.referenceCompare(left, right)) return true;
        if (!left || !right) return false;

        if (Array.isArray(left) || Array.isArray(right)) return false;

        return (
            _.referenceCompare(left.type, right.type) &&
            _.referenceCompare(left.filter, right.filter) &&
            _.referenceCompare(left.filterTo, right.filterTo)  &&
            _.referenceCompare(left.filterType, right.filterType)
        )
    }
}

export class TextFloatingFilterComp extends InputTextFloatingFilterComp<SerializedTextFilter, IFloatingFilterParams<SerializedTextFilter, BaseFloatingFilterChange<SerializedTextFilter>>>{
    asFloatingFilterText(parentModel: SerializedTextFilter): string {
        if (!parentModel) return '';
        return parentModel.filter;
    }

    asParentModel(): SerializedTextFilter {
        let currentParentModel = this.currentParentModel();
        return {
            type: currentParentModel.type,
            filter: this.eColumnFloatingFilter.value,
            filterType: 'text'
        }
    }
}

export class DateFloatingFilterComp extends Component implements IFloatingFilter <SerializedDateFilter, BaseFloatingFilterChange<SerializedDateFilter>, IFloatingFilterParams<SerializedDateFilter, BaseFloatingFilterChange<SerializedDateFilter>>>{
    @Autowired('componentProvider')
    private componentProvider:ComponentProvider;
    private dateComponent:IDateComp;

    onFloatingFilterChanged:(change:BaseFloatingFilterChange<SerializedDateFilter>)=>void;
    currentParentModel:()=>SerializedDateFilter;

    init (params:IFloatingFilterParams<SerializedDateFilter, BaseFloatingFilterChange<SerializedDateFilter>>){
        this.onFloatingFilterChanged = params.onFloatingFilterChanged;
        this.currentParentModel = params.currentParentModel;
        let dateComponentParams: IDateParams = {
            onDateChanged: this.onDateChanged.bind(this)
        };
        this.dateComponent = this.componentProvider.newDateComponent(dateComponentParams);
        let body: HTMLElement = _.loadTemplate(`<div></div>`);
        body.appendChild(this.dateComponent.getGui());
        this.setTemplateFromElement(body);

    }

    private onDateChanged(): void {
        let parentModel:SerializedDateFilter = this.currentParentModel();
        let rawDate:Date = this.dateComponent.getDate();
        if (!rawDate || typeof rawDate.getMonth !== 'function'){
            this.onFloatingFilterChanged(null);
            return;
        }

        let date:string = _.serializeDateToYyyyMmDd(DateFilter.removeTimezone(rawDate), "-");
        let dateTo:string = null;
        let type:string = parentModel.type;
        if (parentModel){
            dateTo = parentModel.dateTo;
        }
        this.onFloatingFilterChanged({
            model:{
                type: type,
                dateFrom: date,
                dateTo: dateTo,
                filterType: 'date'
            },
            apply:true
        });
    }

    onParentModelChanged(parentModel: SerializedDateFilter): void {
        if (!parentModel || !parentModel.dateFrom){
            this.dateComponent.setDate(null);
            return;
        }
        this.dateComponent.setDate(_.parseYyyyMmDdToDate(parentModel.dateFrom, '-'));
    }
}

export class NumberFloatingFilterComp extends InputTextFloatingFilterComp<SerializedNumberFilter, IFloatingFilterParams<SerializedNumberFilter, BaseFloatingFilterChange<SerializedNumberFilter>>>{


    asFloatingFilterText(parentModel: SerializedNumberFilter): string {
        let rawParentModel = this.currentParentModel();
        if (!parentModel && !rawParentModel) return '';
        if (!parentModel && rawParentModel && rawParentModel.type !== 'inRange') {
            this.eColumnFloatingFilter.readOnly = false;
            return '';
        }


        if (rawParentModel && rawParentModel.type === 'inRange'){
            this.eColumnFloatingFilter.readOnly = true;
            let number:number = this.asNumber(rawParentModel.filter);
            let numberTo:number = this.asNumber(rawParentModel.filterTo);
            return (number ? number + '' : '') +
                    '-' +
                (numberTo ? numberTo + '' : '');
        }


        let number:number = this.asNumber(parentModel.filter);
        this.eColumnFloatingFilter.readOnly = false;
        return number ? number + '' : '';

    }

    asParentModel(): SerializedNumberFilter {
        let currentParentModel = this.currentParentModel();
        let filterValueNumber = this.asNumber(this.eColumnFloatingFilter.value);
        let filterValueText:string = this.eColumnFloatingFilter.value;

        let modelFilterValue: number = null;
        if (!filterValueNumber && filterValueText === '') {
            modelFilterValue = null;
        } else if (!filterValueNumber){
            modelFilterValue = currentParentModel.filter;
        } else {
            modelFilterValue = filterValueNumber;
        }

        return {
            type: currentParentModel.type,
            filter: modelFilterValue,
            filterTo: !currentParentModel ? null: currentParentModel.filterTo,
            filterType: 'number'
        };
    }

    private asNumber(value: any):number {
        let invalidNumber = !value || (!_.isNumeric(Number(value)));
        return invalidNumber ? null : Number(value);
    }
}

export class SetFloatingFilterComp extends InputTextFloatingFilterComp<string[], IFloatingFilterParams<string[], BaseFloatingFilterChange<string[]>>>{
    init (params:IFloatingFilterParams<string[], BaseFloatingFilterChange<string[]>>):void{
        super.init(params);
        this.eColumnFloatingFilter.readOnly = true;
    }

    asFloatingFilterText(parentModel: string[]): string {
        if (!parentModel) return '';

        let arrayToDisplay = parentModel.length > 10? parentModel.slice(0, 10).concat(['...']) : parentModel;
        return `(${parentModel.length}) ${arrayToDisplay.join(",")}`;
    }

    asParentModel(): string[] {
        return this.eColumnFloatingFilter.value ?
            this.eColumnFloatingFilter.value.split(","):
            []
    }
}

export class ReadModelAsStringFloatingFilterComp extends InputTextFloatingFilterComp<string, IFloatingFilterParams<string, BaseFloatingFilterChange<string>>>{
    init (params:IFloatingFilterParams<string, BaseFloatingFilterChange<string>>):void{
        super.init(params);
        this.eColumnFloatingFilter.readOnly = true;
    }

    onParentModelChanged(parentModel:any):void{
        this.eColumnFloatingFilter.value = this.asFloatingFilterText (this.currentParentModel());
    }

    asFloatingFilterText(parentModel: string): string {
        return parentModel;
    }

    asParentModel(): string {
        return null;
    }
}